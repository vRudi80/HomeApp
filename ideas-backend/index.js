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

// --- KAPCSOLAT GYŰJTŐ (Filess.io limit védelem) ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    
    waitForConnections: true,
    connectionLimit: 2,
    maxIdle: 1,
    idleTimeout: 5000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

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
        return res.status(403).json({ error: 'Nincs adminisztrátori jogosultságod!' });
    }
    next();
}

async function canAccessData(requesterId, requesterEmail, targetUserId) {
    if (requesterId === targetUserId) return true;
    const [rows] = await pool.query('SELECT id FROM shares WHERE owner_id = ? AND shared_with_email = ?', [targetUserId, requesterEmail]);
    return rows.length > 0;
}

app.get('/ping', (req, res) => res.send('Szerver ébren van! 🚀'));

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

// --- ESZKÖZÖK KEZELÉSE ---
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

// --- ESZKÖZ-KATEGÓRIA MÁTRIX ---
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
        res.status(500).json({ error: 'DB hiba' });
    }
});

app.post('/api/asset-categories/toggle', verifyUser, async (req, res) => {
    const { assetId, categoryName } = req.body;
    try {
        const [assets] = await pool.query('SELECT UserId FROM assets WHERE Id = ?', [assetId]);
        if (assets.length === 0) return res.status(404).json({ error: 'Eszköz nem található' });
        if (assets[0].UserId !== req.userId) return res.status(403).json({ error: 'Nincs jogosultság' });

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
        res.status(500).json({ error: 'DB hiba' });
    }
});

// --- MEGOSZTÁSOK ---
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

// --- REKORDOK ÉS SZÁMLÁK ---
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

app.put('/api/records/:id', verifyUser, async (req, res) => {
    const { type, value, date, assetId } = req.body;
    try {
        await pool.query(
            'UPDATE utility_records SET Type = ?, Value = ?, Date = ?, AssetId = ? WHERE Id = ? AND UserId = ?',
            [type, value, date, assetId, req.params.id, req.userId]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba' }); }
});

app.put('/api/invoices/:id', verifyUser, async (req, res) => {
    const { type, amount, date, assetId } = req.body;
    try {
        await pool.query(
            'UPDATE invoices SET Type = ?, Amount = ?, Month = ?, AssetId = ? WHERE Id = ? AND UserId = ?',
            [type, amount, date, assetId, req.params.id, req.userId]
        );
        res.json({ success: true });
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

// --- EV TÖLTÉSI NAPLÓ (GET, POST, PUT, DELETE) ---
app.get('/api/ev-logs', verifyUser, async (req, res) => {
    const targetUserId = req.query.userId || req.userId;
    if (!(await canAccessData(req.userId, req.userEmail, targetUserId))) return res.status(403).json({ error: "Nincs jogosultság" });
    try {
        const [rows] = await pool.query('SELECT * FROM ev_charging_logs WHERE user_id = ? ORDER BY date DESC, id DESC', [targetUserId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB hiba' }); }
});

app.post('/api/ev-logs', verifyUser, async (req, res) => {
    const { date, location, start_soc, end_soc, kwh_amount, cost_huf, charge_source, driven_km, assetId } = req.body;
    try {
        await pool.query(
            `INSERT INTO ev_charging_logs (user_id, asset_id, date, location, start_soc, end_soc, kwh_amount, cost_huf, charge_source, driven_km)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, assetId || null, date, location, start_soc || null, end_soc || null, kwh_amount || 0, cost_huf || 0, charge_source || 'Hálózat', driven_km || 0]
        );
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba az EV töltés mentésekor' }); }
});

app.put('/api/ev-logs/:id', verifyUser, async (req, res) => {
    const { date, location, start_soc, end_soc, kwh_amount, cost_huf, charge_source, driven_km, assetId } = req.body;
    try {
        await pool.query(
            `UPDATE ev_charging_logs 
             SET date = ?, location = ?, start_soc = ?, end_soc = ?, kwh_amount = ?, cost_huf = ?, charge_source = ?, driven_km = ?, asset_id = ?
             WHERE id = ? AND user_id = ?`,
            [date, location, start_soc || null, end_soc || null, kwh_amount || 0, cost_huf || 0, charge_source || 'Hálózat', driven_km || 0, assetId || null, req.params.id, req.userId]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba az EV töltés módosításakor' }); }
});

app.delete('/api/ev-logs/:id', verifyUser, async (req, res) => {
    try {
        await pool.query('DELETE FROM ev_charging_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.status(204).end();
    } catch (err) { res.status(500).json({ error: 'Hiba a törlésnél' }); }
});

// --- HAVI REFERENCIÁK ÉS NAPELEM ADATOK ---
app.get('/api/benchmarks', verifyUser, async (req, res) => {
    const targetUserId = req.query.userId || req.userId;
    if (!(await canAccessData(req.userId, req.userEmail, targetUserId))) return res.status(403).json({ error: "Nincs jogosultság" });
    try {
        const [rows] = await pool.query('SELECT * FROM monthly_benchmarks WHERE user_id = ? ORDER BY month DESC', [targetUserId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB hiba' }); }
});
// --- HAVI REFERENCIÁK TÖRLÉSE ---
app.delete('/api/benchmarks/:id', verifyUser, async (req, res) => {
    try {
        await pool.query('DELETE FROM monthly_benchmarks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.status(204).end();
    } catch (err) { res.status(500).json({ error: 'Hiba a törlésnél' }); }
});

app.post('/api/benchmarks', verifyUser, async (req, res) => {
    const { month, gasoline_price, avg_consumption, solar_kwh, grid_kwh, grid_kwh_price, market_kwh_price, solar_investment, ev_investment } = req.body;
    try {
        await pool.query(
            `INSERT INTO monthly_benchmarks (user_id, month, gasoline_price, avg_consumption, solar_kwh, grid_kwh, grid_kwh_price, market_kwh_price, solar_investment, ev_investment)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                gasoline_price = VALUES(gasoline_price),
                avg_consumption = VALUES(avg_consumption),
                solar_kwh = VALUES(solar_kwh),
                grid_kwh = VALUES(grid_kwh),
                grid_kwh_price = VALUES(grid_kwh_price),
                market_kwh_price = VALUES(market_kwh_price),
                solar_investment = VALUES(solar_investment),
                ev_investment = VALUES(ev_investment)`,
            [req.userId, month, gasoline_price, avg_consumption, solar_kwh || 0, grid_kwh || 0, grid_kwh_price || 36, market_kwh_price || 70.1, solar_investment || 1950400, ev_investment || 0]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Hiba a referenciák mentésekor' }); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Szerver fut: ${PORT}`));
