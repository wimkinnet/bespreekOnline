const TimeEntry = require('../models/TimeEntry');
const Assignment = require('../models/Assignment');

// Completed assignments with all their entries invoiced move to the final status 'invoiced'.
// Returns the titles of the assignments that were closed.
module.exports = async function closeInvoicedAssignments(assignmentIds) {
  const completed = await Assignment.find({ _id: { $in: assignmentIds }, status: 'completed' }).select('_id title');
  const closed = [];
  for (const assignment of completed) {
    const open = await TimeEntry.exists({ assignment: assignment._id, invoiced: { $ne: true } });
    if (!open) closed.push(assignment);
  }
  await Assignment.updateMany({ _id: { $in: closed.map((a) => a._id) } }, { $set: { status: 'invoiced' } });
  return closed.map((a) => a.title);
};
