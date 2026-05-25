const fs = require('fs');
const path = require('path');
const PublicDocument = require('../models/PublicDocument');
const PublicDocumentView = require('../models/PublicDocumentView');

/* ── ULID Generator for unguessable IDs ── */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateULID() {
  const t = Date.now();
  let timeStr = '', tmp = t;
  for (let i = 9; i >= 0; i--) { timeStr = CROCKFORD[tmp % 32] + timeStr; tmp = Math.floor(tmp / 32); }
  let randStr = '';
  for (let i = 0; i < 16; i++) randStr += CROCKFORD[Math.floor(Math.random() * 32)];
  return timeStr + randStr;
}

/* User-agent parser helper */
function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', device: 'Unknown', os: 'Unknown' };
  let browser = 'Other';
  let device = 'Desktop';
  let os = 'Other';

  if (/mobi|android|iphone|ipad|ipod/i.test(ua)) {
    device = 'Mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  }

  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/msie|trident/i.test(ua)) browser = 'IE';

  return { browser, device, os };
}

/* Create Public Document (Dean/Admin only) */
const createPublicDocument = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    if (!req.file) return res.status(400).json({ message: 'PDF file upload is required.' });

    const internalId = generateULID();
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    if (fileExt !== '.pdf') {
      return res.status(400).json({ message: 'Only PDF documents are allowed.' });
    }

    // Store file directly in MongoDB as a base64 Data URI to prevent data loss on ephemeral filesystems
    const base64Data = `data:application/pdf;base64,${req.file.buffer.toString('base64')}`;

    const doc = await PublicDocument.create({
      internalId,
      title,
      description: description || '',
      filePath: base64Data,
      fileExt,
      createdBy: req.user._id,
      createdByName: req.user.name || req.user.username || 'System',
    });

    res.status(201).json({
      message: 'Public document registered successfully.',
      doc
    });
  } catch (err) {
    console.error('[createPublicDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* List all Public Documents (Dean/Admin only) */
const getPublicDocuments = async (req, res) => {
  try {
    const docs = await PublicDocument.find({}).sort({ createdAt: -1 }).lean();
    res.json(docs);
  } catch (err) {
    console.error('[getPublicDocuments]', err);
    res.status(500).json({ message: err.message });
  }
};

/* Delete Public Document (Dean/Admin only) */
const deletePublicDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await PublicDocument.findOne({ internalId: id });
    if (!doc) return res.status(404).json({ message: 'Public document not found.' });

    // Remove file from disk (only if it is a legacy filesystem path)
    if (doc.filePath && !doc.filePath.startsWith('data:')) {
      const targetPath = path.join(__dirname, '..', doc.filePath);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    }

    await PublicDocument.deleteOne({ _id: doc._id });
    await PublicDocumentView.deleteMany({ publicDocumentId: id });

    res.json({ message: 'Public document and its views tracking deleted.' });
  } catch (err) {
    console.error('[deletePublicDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* Get Public Document Analytics (Dean/Admin only) */
const getPublicDocumentAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await PublicDocument.findOne({ internalId: id }).lean();
    if (!doc) return res.status(404).json({ message: 'Public document not found.' });

    const views = await PublicDocumentView.find({ publicDocumentId: id }).sort({ timestamp: -1 }).lean();

    // Group views by day (last 30 days default fallback)
    const viewsPerDayMap = {};
    views.forEach(v => {
      const dateStr = new Date(v.timestamp).toLocaleDateString('en-CA'); // YYYY-MM-DD local style
      viewsPerDayMap[dateStr] = (viewsPerDayMap[dateStr] || 0) + 1;
    });

    const viewsPerDay = Object.entries(viewsPerDayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Distribution metrics
    const browserDist = {};
    const deviceDist = {};
    const osDist = {};

    views.forEach(v => {
      browserDist[v.browser] = (browserDist[v.browser] || 0) + 1;
      deviceDist[v.device] = (deviceDist[v.device] || 0) + 1;
      osDist[v.os] = (osDist[v.os] || 0) + 1;
    });

    res.json({
      document: doc,
      totalViews: views.length,
      views,
      viewsPerDay,
      distributions: {
        browser: browserDist,
        device: deviceDist,
        os: osDist
      }
    });
  } catch (err) {
    console.error('[getPublicDocumentAnalytics]', err);
    res.status(500).json({ message: err.message });
  }
};

/* View Public Document (PUBLIC - No Auth required) */
const viewPublicDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await PublicDocument.findOne({ internalId: id });
    if (!doc) return res.status(404).json({ message: 'Public document not found.' });

    // Track view anonymously
    const ua = req.headers['user-agent'];
    const { browser, device, os } = parseUserAgent(ua);

    await PublicDocumentView.create({
      publicDocumentId: id,
      browser,
      device,
      os,
      userAgent: ua
    });

    doc.views = (doc.views || 0) + 1;
    await doc.save();

    let fileURL;
    if (doc.filePath && doc.filePath.startsWith('data:')) {
      fileURL = doc.filePath;
    } else {
      const host = req.get('host');
      const protocol = req.protocol;
      fileURL = `${protocol}://${host}/${doc.filePath}`;
    }

    res.json({
      title: doc.title,
      description: doc.description,
      fileURL,
      views: doc.views
    });
  } catch (err) {
    console.error('[viewPublicDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createPublicDocument,
  getPublicDocuments,
  deletePublicDocument,
  getPublicDocumentAnalytics,
  viewPublicDocument
};
