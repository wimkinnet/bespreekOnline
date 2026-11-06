require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const assignmentRoutes = require('./routes/assignments');
const timeEntryRoutes = require('./routes/timeEntries');
const documentRoutes = require('./routes/documents');
const reportRoutes = require('./routes/reports');
const distanceRoutes = require('./routes/distance');
const settingsRoutes = require('./routes/settings');
const travelClaimRoutes = require('./routes/travelClaims');
const invoiceRoutes = require('./routes/invoices');
const proposalRoutes = require('./routes/proposals');

const app = express();

connectDB();

app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/distance', distanceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/travel-claims', travelClaimRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/proposals', proposalRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// In production, serve the built React app from /client/dist for a single Render web service
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Central error handler (e.g. multer file-size/type errors)
app.use((err, req, res, next) => {
  console.error(err);
  // Upload problems (wrong type, too large) are for the user to fix, so they are not server errors
  const status = err.status || (err.name === 'MulterError' || err.code === 'UNSUPPORTED_FILE' ? 400 : 500);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large (25 MB at most).' : err.message;
  res.status(status).json({ message: message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
