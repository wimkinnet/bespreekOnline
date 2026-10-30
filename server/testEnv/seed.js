// Dummy data for the test environment. Only ever runs against a database on this machine.
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Client = require('../models/Client');
const Setting = require('../models/Setting');
const TimeEntry = require('../models/TimeEntry');
const TravelClaim = require('../models/TravelClaim');
const User = require('../models/User');
const computeAmount = require('../utils/computeAmount');
const { officialRateFor } = require('../utils/kmRates');

const ADMIN_EMAIL = 'test.admin@example.com';
const CONSULTANT_EMAIL = 'test.consultant@example.com';
const PASSWORD = 'test1234';

function daysAgo(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

async function seed() {
  const { host } = mongoose.connection;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`Refusing to seed a remote database (${host}).`);
  if (await User.exists({})) return; // already seeded, keep what was changed in earlier test sessions

  await Setting.create({
    key: 'company',
    company: {
      name: 'Testbedrijf bv',
      street: 'Teststraat 1',
      postalCode: '9000',
      city: 'Gent',
      enterpriseNumber: 'BE 0000.000.000',
    },
  });

  const homeAddress = { street: 'Voorbeeldlaan 10', postalCode: '2000', city: 'Antwerpen' };
  const admin = await User.create({
    name: 'Test Admin',
    email: ADMIN_EMAIL,
    password: PASSWORD,
    role: 'admin',
    homeAddress,
    iban: 'BE00 0000 0000 0000',
  });
  const consultant = await User.create({
    name: 'Test Consultant',
    email: CONSULTANT_EMAIL,
    password: PASSWORD,
    role: 'consultant',
    homeAddress: { street: 'Proefstraat 5', postalCode: '3000', city: 'Leuven' },
    iban: 'BE11 1111 1111 1111',
  });

  const contact = (name) => ({ contactName: name, contactEmail: 'contact@example.com', contactPhone: '000 00 00 00' });
  const group = await Client.create({
    name: 'Test Scholengroep Horizon',
    type: 'school_pool',
    vatNumber: 'BE 0000.000.001',
    address: { street: 'Groepsplein 1', postalCode: '9000', city: 'Gent' },
    ...contact('An Voorbeeld'),
  });
  const school = await Client.create({
    name: 'Testschool De Regenboog',
    type: 'school',
    parentPool: group._id,
    vatNumber: 'BE 0000.000.002',
    address: { street: 'Schoolstraat 12', postalCode: '9000', city: 'Gent' },
    ...contact('Bart Proef'),
  });
  const independent = await Client.create({
    name: 'Testcollege Sint-Voorbeeld',
    type: 'school',
    address: { street: 'Collegelaan 3', postalCode: '2800', city: 'Mechelen' },
    ...contact('Carla Test'),
  });
  const other = await Client.create({
    name: 'Stichting Testonderwijs vzw',
    type: 'other',
    vatNumber: 'BE 0000.000.003',
    address: { street: 'Stichtingsweg 7', postalCode: '3000', city: 'Leuven' },
    ...contact('Dirk Dummy'),
  });
  const foreign = await Client.create({
    name: 'Test Bildung GmbH',
    type: 'other',
    vatNumber: 'DE000000000',
    vatExempt: true,
    address: { street: 'Musterstrasse 1', postalCode: '50667', city: 'Köln', country: 'Germany' },
    ...contact('Eva Muster'),
  });

  const assignment = (client, title, billingType, rate, extra = {}) =>
    Assignment.create({
      client: client._id,
      title,
      billingType,
      rate,
      consultants: [consultant._id, admin._id],
      startDate: daysAgo(120),
      createdBy: admin._id,
      ...extra,
    });
  const coaching = await assignment(school, 'Coaching directie', 'hourly', 95);
  const teamDay = await assignment(independent, 'Studiedagen schoolteam', 'daily', 850);
  const halfDay = await assignment(group, 'Beleidsbegeleiding scholengroep', 'half_day', 450);
  const fixed = await assignment(other, 'Audit kwaliteitszorg', 'fixed', 5000);
  const foreignWork = await assignment(foreign, 'Workshop Schulentwicklung', 'hourly', 120);
  const closed = await assignment(school, 'Afgerond traject taalbeleid', 'daily', 800, { status: 'invoiced' });

  const entry = (a, by, ago, logged, extra = {}) => {
    const { amount, rateApplied, billingType } = computeAmount(a, logged);
    return TimeEntry.create({
      consultant: by._id,
      assignment: a._id,
      client: a.client,
      date: daysAgo(ago),
      hours: logged.hours,
      days: logged.days,
      description: `Testregistratie ${a.title}`,
      billingType,
      rateApplied,
      amount,
      ...extra,
    });
  };
  const travel = (km) => ({ travelIncluded: true, travelKm: km, travelRate: 0.45, travelAmount: Math.round(km * 0.45) });

  // Not invoiced yet: what an invoice run would pick up
  await entry(coaching, consultant, 3, { hours: 3.5 }, travel(120));
  await entry(coaching, admin, 8, { hours: 2 });
  await entry(teamDay, consultant, 5, { days: 1 }, travel(70));
  await entry(halfDay, admin, 6, { days: 0.5 }, travel(110));
  await entry(fixed, consultant, 10, { hours: 12, feeAmount: 2000 });
  await entry(foreignWork, admin, 4, { hours: 6 }, travel(420));
  await entry(foreignWork, consultant, 9, { hours: 2 }, { billable: false });
  await entry(teamDay, admin, 7, { days: 0.5 }, {
    travelIncluded: true,
    travelType: 'other',
    travelNote: 'Treinticket Gent - Mechelen',
    travelAmount: 18.6,
  });

  // Already invoiced, on an assignment that is closed for good
  await entry(closed, consultant, 60, { days: 1 }, { invoiced: true });
  await entry(closed, admin, 55, { days: 2 }, { invoiced: true });

  // Not invoiced, but its travel is on an expense claim, so the entry is locked
  const claimed = await entry(coaching, consultant, 40, { hours: 4 }, travel(120));
  const { rate } = officialRateFor(claimed.date);
  const now = new Date();
  const claim = await TravelClaim.create({
    consultant: consultant._id,
    year: now.getFullYear(),
    sequence: 1,
    number: `KM-${now.getFullYear()}-001`,
    issueDate: now,
    periodFrom: claimed.date,
    periodTo: claimed.date,
    beneficiary: { name: consultant.name, ...consultant.homeAddress.toObject(), iban: consultant.iban },
    company: (await Setting.findOne({ key: 'company' })).toObject().company,
    lines: [
      {
        timeEntry: claimed._id,
        date: claimed.date,
        clientName: school.name,
        destination: school.address.city,
        assignmentTitle: coaching.title,
        km: claimed.travelKm,
        rate,
        amount: roundCents(claimed.travelKm * rate),
      },
    ],
    totalKm: claimed.travelKm,
    totalAmount: roundCents(claimed.travelKm * rate),
    createdBy: admin._id,
    approvedByName: admin.name,
  });
  claimed.travelClaim = claim._id;
  await claimed.save();

  console.log('Test environment: dummy data created.');
}

module.exports = seed;
module.exports.ADMIN_EMAIL = ADMIN_EMAIL;
module.exports.CONSULTANT_EMAIL = CONSULTANT_EMAIL;
module.exports.PASSWORD = PASSWORD;
