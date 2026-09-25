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
  res.status(err.status || 500).json({ message: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
