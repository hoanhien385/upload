const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(session({ secret: 'drive_secret', resave: false, saveUninitialized: true }));

// Multer
const upload = multer({ storage: multer.memoryStorage() });

// OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Bước 1: Redirect người dùng đến Google
app.get('/auth', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
    });
    res.redirect(url);
});

// Bước 2: Google redirect lại về server kèm mã
app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    res.send('✅ Xác thực thành công! Giờ bạn có thể tải file.');
});

// Upload file sau khi đã xác thực
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.session.tokens) return res.status(401).send('Chưa xác thực OAuth');

    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const bufferStream = require('stream').PassThrough();
    bufferStream.end(req.file.buffer);

    const response = await drive.files.create({
        requestBody: {
            name: req.file.originalname,
        },
        media: {
            mimeType: req.file.mimetype,
            body: bufferStream,
        },
        fields: 'id, webViewLink',
    });

    res.json({ link: response.data.webViewLink });
});

// Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
