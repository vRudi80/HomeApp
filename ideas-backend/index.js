require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_CLIENT_ID = "197361744572-ih728hq5jft3fqfd1esvktvrd8i97kcp.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const ADMIN_EMAILS = ['kovari.rudolf@gmail.com']; 

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
  connectionLimit: 2,
  maxIdle: 2,
  idleTimeout: 30000,        // 30 másodperc tétlenség után automatikusan lezárja és tisztítja az alvó kapcsolatot
  enableKeepAlive: true,     // Bekapcsolja a TCP Keep-Alive-ot a háttérben
  keepAliveInitialDelay: 10000 // 10 másodpercenként küld egy pinget az adatbázisnak, hogy életben tartsa
});

// --- AUTENTIKÁCIÓ ÉS JOGOSULTSÁGOK ---
async function verifyUser(req, res, next) {
    const cronKey = req.headers['x-cron-key'];
    const SAFE_CRON_KEY = process.env.CRON_SECRET || "SzuperTitkosCronKulcs123_2026";
    
    if (cronKey && cronKey === SAFE_CRON_KEY) {
        req.userId = "CRON_ADMIN"; 
        req.userEmail = "cron@rezsiapp.system";
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send('Nincs token!');
    
    const token = authHeader.split(' ')[1];
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        req.userId = payload.sub;
        req.userEmail = payload.email;
        next();
    } catch (err) { 
        res.status(401).send('Érvénytelen munkamenet'); 
    }
}

function requireAdmin(req, res, next) {
    if (!ADMIN_EMAILS.includes(req.userEmail)) {
        return res.status(403).json({ error: 'Nincs adminisztrátori jogosulterősséged!' });
    }
    next();
}

async function canAccessData(requesterId, requesterEmail, targetUserId) {
    if (requesterId === targetUserId) return true;
    const [rows] = await pool.query('SELECT id FROM shares WHERE owner_id = ? AND shared_with_email = ?', [targetUserId, requesterEmail]);
    return rows.length > 0;
}

// --- ÉBRENTARTÓ VÉGPONT ---
app.get('/ping', (req, res) => {
    res.send('Szerver ébren van! 🚀');
});

// --- BELÉPÉS NAPLÓZÁSA ---
app.post('/api/login-sync', verifyUser, async (req, res) => {
    try {
        await pool.query(
            `INSERT INTO users (google_id, email, last_login) 
             VALUES (?, ?, NOW()) 
             ON DUPLICATE KEY UPDATE last_login = NOW(), email = VALUES(email)`,
            [req.userId, req.userEmail]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Login log hiba:", err);
        res.status(500).json({ error: 'Nem sikerült naplózni a belépést' });
    }
});

// --- KATEGÓRIÁK KEZELÉSE ---
app.get('/api/categories', verifyUser, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM categories ORDER BY Id ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB hiba' }); }
});

app.post('/api/categories', verifyUser, requireAdmin, async (req, res) => {
    const { name, icon, type } = req.body;
    try {
        await pool.query('INSERT INTO categories (Name, Icon, Type) VALUES (?, ?, ?)', [name, icon, type]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.put('/api/categories/:id', verifyUser, requireAdmin, async (req, res) => {
    const { name, icon, type } = req.body;
    try {
        await pool.query('UPDATE categories SET Name = ?, Icon = ?, Type = ? WHERE Id = ?', [name, icon, type, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.delete('/api/categories/:id', verifyUser, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM categories WHERE Id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

// --- ESZKÖZÖK (ASSETS) KEZELÉSE ---
app.get('/api/assets', verifyUser, async (req, res) => {
    const targetUserId = req.query.userId || req.userId;
    if (!(await canAccessData(req.userId, req.userEmail, targetUserId))) return res.status(403).json({ error: "Nincs jogosultság" });
    try {
        const [rows] = await pool.query('SELECT * FROM assets WHERE UserId = ?', [targetUserId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB hiba' }); }
});

app.post('/api/assets', verifyUser, async (req, res) => {
    const { category, friendlyName, city, street, houseNumber, plateNumber, fuelType, area } = req.body;
    try {
        const [result] = await pool.query(
            `INSERT INTO assets (UserId, Category, FriendlyName, City, Street, HouseNumber, PlateNumber, FuelType, Area) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, category, friendlyName, city || '', street || '', houseNumber || '', plateNumber || '', fuelType || 'Benzin', area === '' ? null : area]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error("SQL hiba az eszköz mentésekor:", err);
        res.status(500).json({ error: 'Hiba a mentésnél' });
    }
});

app.put('/api/assets/:id', verifyUser, async (req, res) => {
    const { friendlyName, category, city, street, plateNumber, area } = req.body;
    try {
        await pool.query(
            `UPDATE assets 
             SET FriendlyName = ?, Category = ?, City = ?, Street = ?, PlateNumber = ?, Area = ? 
             WHERE Id = ? AND UserId = ?`,
            [friendlyName, category, city || '', street || '', plateNumber || '', area === '' ? null : area, req.params.id, req.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Hiba a módosításnál' });
    }
});

app.delete('/api/assets/:id', verifyUser, async (req, res) => {
    try {
        await pool.query('DELETE FROM assets WHERE Id = ? AND UserId = ?', [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

// --- ESZKÖZ-KATEGÓRIA ASSZOCIÁCIÓK (MÁTRIX) ---
app.get('/api/asset-categories', verifyUser, async (req, res) => {
    const targetUserId = req.query.userId || req.userId;
    if (!(await canAccessData(req.userId, req.userEmail, targetUserId))) return res.status(403).json({ error: "Nincs jogosultság" });
    try {
        const [rows] = await pool.query(
            `SELECT ac.asset_id, ac.category_name 
             FROM asset_allowed_categories ac
             JOIN assets a ON ac.asset_id = a.Id
             WHERE a.UserId = ?`, [targetUserId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'DB hiba az összerendelések lekérésekor' });
    }
});

app.post('/api/asset-categories/toggle', verifyUser, async (req, res) => {
    const { assetId, categoryName } = req.body;
    try {
        const [assets] = await pool.query('SELECT UserId FROM assets WHERE Id = ?', [assetId]);
        if (assets.length === 0) return res.status(404).json({ error: 'Eszköz nem található' });
        if (assets[0].UserId !== req.userId) return res.status(403).json({ error: 'Csak a saját eszközöd kategóriáit módosíthatod!' });

        const [existing] = await pool.query(
            'SELECT id FROM asset_allowed_categories WHERE asset_id = ? AND category_name = ?',
            [assetId, categoryName]
        );

        if (existing.length > 0) {
            await pool.query('DELETE FROM asset_allowed_categories WHERE asset_id = ? AND category_name = ?', [assetId, categoryName]);
            res.json({ success: true, action: 'removed' });
        } else {
            await pool.query('INSERT INTO asset_allowed_categories (asset_id, category_name) VALUES (?, ?)', [assetId, categoryName]);
            res.json({ success: true, action: 'added' });
        }
    } catch (err) {
        res.status(500).json({ error: 'DB hiba a módosítás mentésekor' });
    }
});

// --- MEGOSZTÁSOK (SHARES) KEZELÉSE ---
app.post('/api/shares', verifyUser, async (req, res) => {
    try {
        await pool.query('INSERT INTO shares (owner_id, owner_email, shared_with_email) VALUES (?, ?, ?)', [req.userId, req.userEmail, req.body.sharedWithEmail]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.get('/api/shares/me', verifyUser, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT owner_id, owner_email FROM shares WHERE shared_with_email = ?', [req.userEmail]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.get('/api/shares/owned', verifyUser, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM shares WHERE owner_id = ?', [req.userId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.delete('/api/shares/:id', verifyUser, async (req, res) => {
    try {
        await pool.query('DELETE FROM shares WHERE id = ? AND owner_id = ?', [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

// --- REKORDOK ÉS SZÁMLÁK KEZELÉSE ---
app.get('/api/records', verifyUser, async (req, res) => {
    const targetUserId = req.query.userId || req.userId;
    if (!(await canAccessData(req.userId, req.userEmail, targetUserId))) return res.status(403).json({ error: "Nincs jogosultság" });
    try {
        const [rows] = await pool.query('SELECT Id, Type, Value, AssetId, DATE_FORMAT(Date, "%Y-%m-%d %H:%i") as FormattedDate FROM utility_records WHERE UserId = ? ORDER BY Date DESC', [targetUserId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB hiba' }); }
});

app.get('/api/invoices', verifyUser, async (req, res) => {
    const targetUserId = req.query.userId || req.userId;
    if (!(await canAccessData(req.userId, req.userEmail, targetUserId))) return res.status(403).json({ error: "Nincs jogosultság" });
    try {
        const [rows] = await pool.query('SELECT * FROM invoices WHERE UserId = ? ORDER BY Month DESC', [targetUserId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB hiba' }); }
});

app.post('/api/records', verifyUser, async (req, res) => {
    const { type, value, date, assetId } = req.body;
    try {
        await pool.query('INSERT INTO utility_records (Type, Value, Date, UserId, AssetId) VALUES (?, ?, ?, ?, ?)', [type, value, date, req.userId, assetId]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.post('/api/invoices', verifyUser, async (req, res) => {
    const { type, amount, date, assetId } = req.body;
    try {
        await pool.query('INSERT INTO invoices (Type, Amount, Month, UserId, AssetId) VALUES (?, ?, ?, ?, ?)', [type, amount, date, req.userId, assetId]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.delete('/api/records/:id', verifyUser, async (req, res) => {
    await pool.query('DELETE FROM utility_records WHERE Id = ? AND UserId = ?', [req.params.id, req.userId]);
    res.status(204).end();
});

app.delete('/api/invoices/:id', verifyUser, async (req, res) => {
    await pool.query('DELETE FROM invoices WHERE Id = ? AND UserId = ?', [req.params.id, req.userId]);
    res.status(204).end();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Szerver fut: ${PORT}`));
