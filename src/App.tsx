import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

const BACKEND_URL = "https://react-ideas-backend.onrender.com";
const GOOGLE_CLIENT_ID = "197361744572-ih728hq5jft3fqfd1esvktvrd8i97kcp.apps.googleusercontent.com";
const ASSET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const ADMIN_EMAILS = ['kovari.rudolf@gmail.com'];

function App() {
  const [user, setUser] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sharedUsers, setSharedUsers] = useState<any[]>([]);
  const [myShares, setMyShares] = useState<any[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('all');
  
  // Navigációs állapot (dashboard / transactions / settings)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'settings'>('dashboard');
  
  // Kijelölt eszköz a beállítások menüpont alatti mátrixhoz
  const [matrixSelectedAssetId, setMatrixSelectedAssetId] = useState<string>('');

  const [recordMode, setRecordMode] = useState<'meter' | 'invoice'>('meter');
  const [targetAssetId, setTargetAssetId] = useState('');
  const [type, setType] = useState('');
  const [value, setValue] = useState('');
  const [meterDate, setMeterDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  
  const [editingRecordId, setEditingRecordId] = useState<number | string | null>(null);
  const [editingRecordLType, setEditingRecordLType] = useState<'meter' | 'invoice' | null>(null);
  
  const [newAsset, setNewAsset] = useState({ 
    category: 'property', friendlyName: '', city: '', street: '', 
    houseNumber: '', plateNumber: '', fuelType: 'Benzin', area: '' 
  });
  const [newCategory, setNewCategory] = useState({ name: '', icon: '📄', type: 'both', isPublic: false });

  const [filter, setFilter] = useState('Összes');
  const [viewMode, setViewMode] = useState('monthly'); 
  const [displayMode, setDisplayMode] = useState('cost');
  
  const [chartRange, setChartRange] = useState<number | 'all' | 'custom'>(12);
  const [customStartDate, setCustomStartDate] = useState<string>('2024-01');
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().substring(0, 7));

  const [assetCategoryMap, setAssetCategoryMap] = useState<{ [key: string]: string[] }>({});

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);
  const isReadOnly = viewingUserId !== null && viewingUserId !== user?.sub;

  // Automatikusan kijelöli az első eszközt a mátrixhoz, ha betöltődtek az eszközök
  useEffect(() => {
    if (assets.length > 0 && !matrixSelectedAssetId) {
      setMatrixSelectedAssetId(String(assets[0].Id));
    }
  }, [assets]);

  // --- API KAPCSOLATOK ---
  const handleToggleCategoryForAsset = async (assetId: string, categoryName: string) => {
    if (isReadOnly) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/asset-categories/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ assetId: parseInt(assetId), categoryName })
      });
      if (res.ok) {
        const currentAllowed = assetCategoryMap[assetId] || [];
        const updated = currentAllowed.includes(categoryName)
          ? currentAllowed.filter(c => c !== categoryName)
          : [...currentAllowed, categoryName];
        setAssetCategoryMap({ ...assetCategoryMap, [assetId]: updated });
      }
    } catch (e) { console.error(e); }
  };

  const fetchMyShares = async (token: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/shares/owned`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setMyShares(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchSharedAccounts = async (token: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/shares/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setSharedUsers(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchAll = async (token: string, targetId?: string) => {
    const id = targetId || viewingUserId || user?.sub;
    if (!id || !token) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [recRes, invRes, assetRes, catRes, acRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/records?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/invoices?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/assets?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/categories?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/asset-categories?userId=${id}`, { headers })
      ]);
      if (recRes.status === 401) return forceLogout();
      
      const recData = await recRes.json();
      const invData = await invRes.json();
      const astData = await assetRes.json();
      const catData = await catRes.json();
      const acData = await acRes.json();
      
      setRecords(Array.isArray(recData) ? recData : []);
      setInvoices(Array.isArray(invData) ? invData : []);
      setAssets(Array.isArray(astData) ? astData : []);
      setCategories(Array.isArray(catData) ? catData : []);

      if (Array.isArray(acData)) {
        const map: { [key: string]: string[] } = {};
        acData.forEach((row: any) => {
          const aId = String(row.asset_id);
          if (!map[aId]) map[aId] = [];
          map[aId].push(row.category_name);
        });
        setAssetCategoryMap(map);
      }
    } catch (err) { console.error(err); }
  };

  const handleLoginSuccess = async (token: string) => {
    try {
      const decoded: any = jwtDecode(token);
      setUser({ ...decoded, token });
      setViewingUserId(decoded.sub);
      localStorage.setItem('userToken', token);
      
      fetchAll(token, decoded.sub);
      fetchSharedAccounts(token);
      fetchMyShares(token);

      await fetch(`${BACKEND_URL}/api/login-sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
    } catch (e) { forceLogout(); }
  };

  const forceLogout = () => {
    googleLogout(); setUser(null); setRecords([]); setInvoices([]); setAssets([]); 
    setCategories([]); setSharedUsers([]); setMyShares([]); localStorage.removeItem('userToken');
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('userToken');
    if (savedToken) handleLoginSuccess(savedToken);
  }, []);

  const getAllowedTypes = (assetId: string) => {
    const allCatNames = categories.map(c => c.Name);
    if (!assetId || assetId === 'all') return allCatNames;
    if (assetCategoryMap[assetId] && assetCategoryMap[assetId].length > 0) {
      return assetCategoryMap[assetId];
    }
    const asset = assets.find((a: any) => String(a.Id) === String(assetId));
    if (asset?.Category === 'car') return allCatNames.includes('Üzemanyag') ? ['Üzemanyag'] : allCatNames;
    return allCatNames;
  };

  useEffect(() => {
    if (selectedAssetId !== 'all') {
      if (!editingRecordId) setTargetAssetId(selectedAssetId);
    } else {
      setFilter('Összes');
    }
  }, [selectedAssetId]);

  // --- GRAFIKON ADATOK ---
  const chartData = useMemo(() => {
    const dataMap: { [key: string]: any } = {};
    const fRec = records.filter((r: any) => selectedAssetId === 'all' || String(r.AssetId) === String(selectedAssetId));
    const fInv = invoices.filter((i: any) => selectedAssetId === 'all' || String(i.AssetId) === String(selectedAssetId));

    if (displayMode === 'usage') {
      const assetsMap: { [key: string]: any[] } = {};
      fRec.filter((r: any) => (filter === 'Összes' || filter === 'Összes kiadás' ? true : r.Type === filter)).forEach((r: any) => {
        if (!assetsMap[r.AssetId]) assetsMap[r.AssetId] = [];
        assetsMap[r.AssetId].push(r);
      });

      Object.keys(assetsMap).forEach(assetId => {
        const filtered = assetsMap[assetId].sort((a: any, b: any) => new Date(a.FormattedDate).getTime() - new Date(b.FormattedDate).getTime());
        for (let i = 1; i < filtered.length; i++) {
          const diff = parseFloat(filtered[i].Value) - parseFloat(filtered[i-1].Value);
          if (diff >= 0) {
            const key = viewMode === 'monthly' ? filtered[i].FormattedDate.substring(0, 7) : filtered[i].FormattedDate.substring(0, 4);
            const asset = assets.find(a => String(a.Id) === String(assetId));
            const label = asset ? asset.FriendlyName : 'Egyéb';
            if (!dataMap[key]) dataMap[key] = { label: key };
            dataMap[key][label] = (dataMap[key][label] || 0) + diff;
          }
        }
      });
    } else {
      const keyLen = viewMode === 'monthly' ? 7 : 4;
      fInv.filter((inv: any) => {
        if (filter === 'Összes') return true;
        if (filter === 'Összes kiadás') return categories.find(c => c.Name === inv.Type)?.Type !== 'income';
        return inv.Type === filter;
      }).forEach((inv: any) => {
        const key = String(inv.Month || "").substring(0, keyLen);
        const asset = assets.find(a => String(a.Id) === String(inv.AssetId));
        const label = asset ? asset.FriendlyName : 'Egyéb';
        const isIncome = categories.find(c => c.Name === inv.Type)?.Type === 'income';
        if (key && key.length >= 4) {
          if (!dataMap[key]) dataMap[key] = { label: key };
          if (isIncome) {
            dataMap[key][`${label}_income`] = (dataMap[key][`${label}_income`] || 0) + parseFloat(inv.Amount || 0);
          } else {
            dataMap[key][label] = (dataMap[key][label] || 0) + parseFloat(inv.Amount || 0);
          }
        }
      });
    }
    const sorted = Object.values(dataMap).sort((a: any, b: any) => a.label.localeCompare(b.label));
    return chartRange === 'custom' ? sorted : (chartRange === 'all' ? sorted : sorted.slice(-chartRange));
  }, [records, invoices, assets, filter, displayMode, viewMode, selectedAssetId, chartRange]);

  // --- REKORD MENTÉSE ---
  const handleSave = async () => {
    if (!targetAssetId || targetAssetId === 'all' || !value) return alert("Hiányzó adatok!");
    const currentCat = categories.find(c => c.Name === type);
    const isInvoice = recordMode === 'invoice' || currentCat?.Type === 'invoice_only' || currentCat?.Type === 'income';
    const body = { type, value: parseFloat(value), amount: parseFloat(value), date: isInvoice ? invoiceDate : meterDate, assetId: parseInt(targetAssetId) };
    const endpoint = editingRecordId ? `/api/${editingRecordLType === 'meter' ? 'records' : 'invoices'}/${editingRecordId}` : (isInvoice ? '/api/invoices' : '/api/records');
    
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: editingRecordId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(body)
    });
    if (res.ok) { setValue(''); setEditingRecordId(null); fetchAll(user.token, viewingUserId!); }
  };

  const handleAssetSave = async () => {
    if (!newAsset.friendlyName) return alert("Név kötelező!");
    const res = await fetch(`${BACKEND_URL}/api/assets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(newAsset)
    });
    if (res.ok) { setNewAsset({ category: 'property', friendlyName: '', city: '', street: '', houseNumber: '', plateNumber: '', fuelType: 'Benzin', area: '' }); fetchAll(user.token); }
  };

  const handleShare = async () => {
    if (!shareEmail) return;
    const res = await fetch(`${BACKEND_URL}/api/shares`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({ sharedWithEmail: shareEmail })
    });
    if (res.ok) { setShareEmail(''); fetchMyShares(user.token); }
  };

  const getIcon = (t: string) => {
    if (t === 'Összes') return '📊'; if (t === 'Összes kiadás') return '📉';
    return categories.find(c => c.Name === t)?.Icon || '📄';
  };

  const getColor = (t: string = filter) => {
    if (displayMode === 'cost' && t !== 'Összes' && t !== 'Összes kiadás') return '#10b981';
    if (t === 'Összes') return '#4f46e5'; if (t === 'Összes kiadás') return '#ef4444';
    return '#64748b';
  };

  const combinedList = [
    ...(filter === 'Összes' || filter === 'Összes kiadás' ? [] : records.filter(r => (selectedAssetId === 'all' || String(r.AssetId) === String(selectedAssetId)) && r.Type === filter).map(r => ({ ...r, lType: 'meter', d: r.FormattedDate }))),
    ...invoices.filter(i => {
      if (selectedAssetId !== 'all' && String(i.AssetId) !== String(selectedAssetId)) return false;
      if (filter === 'Összes') return true;
      if (filter === 'Összes kiadás') return categories.find(c => c.Name === i.Type)?.Type !== 'income';
      return i.Type === filter;
    }).map(i => ({ ...i, lType: 'invoice', Value: i.Amount, d: i.Month }))
  ].sort((a, b) => new Date(b.d).getTime() - new Date(a.d).getTime());

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="app-container">
        
        {/* --- MODERNISELT APPS HEADER --- */}
        <header className="app-header">
          <div className="header-brand-section">
            <span className="brand-icon">⚡</span>
            <h2>Rezsiapp <span className="version-tag">2.0</span></h2>
          </div>
          
          {user && (
            <nav className="header-navigation-tabs">
              <button className={`nav-tab-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Műszerfal</button>
              <button className={`nav-tab-link ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>📜 Tranzakciók</button>
              <button className={`nav-tab-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ Beállítások & Eszközök</button>
            </nav>
          )}

          {user && (
            <div className="header-user-badge">
              <img src={user.picture} alt="Avatar" className="user-round-avatar" />
              <button className="logout-trigger-btn" onClick={forceLogout} title="Kijelentkezés">🚪</button>
            </div>
          )}
        </header>

        {user ? (
          <div className="main-content-router">
            
            {/* ================= TAB 1: MŰSZERFAL ================= */}
            {activeTab === 'dashboard' && (
              <div className="dashboard-layout-grid">
                
                {/* BAL OLDALSÁV: ADATRÖGZÍTÉS */}
                <aside className="sidebar-container">
                  <div className="ui-widget-card">
                    <label className="input-label-flat">Eszköz gyorsválasztó</label>
                    <select className="form-control-select" value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
                      <option value="all">🌐 Összesített nézet</option>
                      {assets.map((a: any) => (
                        <option key={a.Id} value={a.Id}>{a.Category === 'car' ? '🚗' : a.Category === 'person' ? '👤' : '🏠'} {a.FriendlyName}</option>
                      ))}
                    </select>
                  </div>

                  {!isReadOnly && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">Új adat hozzáadása</h3>
                      <div className="mode-toggle-pill">
                        <button className={`pill-item ${recordMode === 'meter' ? 'active' : ''}`} onClick={() => setRecordMode('meter')}>📟 Óraállás</button>
                        <button className={`pill-item ${recordMode === 'invoice' ? 'active' : ''}`} onClick={() => setRecordMode('invoice')}>💰 Számla</button>
                      </div>
                      <div className="form-stack-vertical">
                        <select value={targetAssetId} onChange={(e) => setTargetAssetId(e.target.value)}>
                          <option value="">Eszköz választás...</option>
                          {assets.map((a: any) => (<option key={a.Id} value={a.Id}>{a.FriendlyName}</option>))}
                        </select>
                        <select value={type} onChange={(e) => setType(e.target.value)}>
                          {getAllowedTypes(targetAssetId).map(t => <option key={t} value={t}>{getIcon(t)} {t}</option>)}
                        </select>
                        <input type="date" value={recordMode === 'meter' ? meterDate : invoiceDate} onChange={(e) => recordMode === 'meter' ? setMeterDate(e.target.value) : setInvoiceDate(e.target.value)} />
                        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Érték / Összeg" />
                        <button className="btn-action-primary" onClick={handleSave}>Adat mentése</button>
                      </div>
                    </div>
                  )}
                </aside>

                {/* JOBB OLDAL: KATEGÓRIÁK ÉS GRAFIKON */}
                <section className="main-viewport-pane">
                  
                  {/* FIX GOMB RÁCS - ELFÉR MIND, NINCS ELDUGVA */}
                  <div className="ui-widget-card">
                    <div className="grid-wrapping-chips">
                      {categories.map(c => (
                        <button key={c.Id} className={`grid-chip-item ${filter === c.Name ? 'active' : ''}`} onClick={() => setFilter(c.Name)} style={filter === c.Name ? {backgroundColor: getColor(c.Name), color: 'white'} : {}}>{c.Icon} {c.Name}</button>
                      ))}
                      {displayMode === 'cost' && (
                        <>
                          <button className={`grid-chip-item ${filter === 'Összes kiadás' ? 'active' : ''}`} onClick={() => setFilter('Összes kiadás')} style={{backgroundColor: getColor('Összes kiadás'), color:'white'}}>{getIcon('Összes kiadás')} Összes kiadás</button>
                          <button className={`grid-chip-item ${filter === 'Összes' ? 'active' : ''}`} onClick={() => setFilter('Összes')} style={{backgroundColor: getColor('Összes'), color:'white'}}>{getIcon('Összes')} Összesen</button>
                        </>
                      )}
                    </div>

                    <div className="chart-filter-controls-row">
                      <div className="compact-btn-group">
                        <button className={displayMode === 'usage' ? 'active' : ''} onClick={() => setDisplayMode('usage')}>Fogyasztás</button>
                        <button className={displayMode === 'cost' ? 'active' : ''} onClick={() => setDisplayMode('cost')}>Költség</button>
                      </div>
                      <div className="compact-btn-group">
                        <button className={viewMode === 'monthly' ? 'active' : ''} onClick={() => setViewMode('monthly')}>Havi</button>
                        <button className={viewMode === 'annual' ? 'active' : ''} onClick={() => setViewMode('annual')}>Éves</button>
                      </div>
                    </div>
                  </div>

                  <div className="ui-widget-card">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" fontSize={12} stroke="#64748b" />
                        <YAxis fontSize={12} stroke="#64748b" tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" />
                        {(selectedAssetId === 'all' ? assets : assets.filter(a => String(a.Id) === String(selectedAssetId))).map((asset, idx) => (
                          <React.Fragment key={asset.Id}>
                            <Bar dataKey={asset.FriendlyName} stackId="a" fill={ASSET_COLORS[idx % ASSET_COLORS.length]} radius={[3,3,0,0]} />
                          </React.Fragment>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>
            )}

            {/* ================= TAB 2: TRANZAKCIÓK ================= */}
            {activeTab === 'transactions' && (
              <div className="fullwidth-list-view">
                <div className="list-title-header-row">
                  <h3>Minden rögzített adat ({combinedList.length} tétel)</h3>
                </div>
                <div className="modern-data-table-stack">
                  {combinedList.map((item: any, idx) => {
                    const asset = assets.find(a => String(a.Id) === String(item.AssetId));
                    const isInc = categories.find(c => c.Name === item.Type)?.Type === 'income';
                    return (
                      <div key={idx} className="table-row-card">
                        <div className="row-left-info">
                          <span className="row-badge-type">{item.lType === 'meter' ? '📟 Óra' : '💰 Számla'}</span>
                          <div>
                            <div className="row-main-title">{getIcon(item.Type)} {item.Type}</div>
                            <div className="row-sub-title">{asset ? asset.FriendlyName : 'Ismeretlen'} • {String(item.d).substring(0, 10)}</div>
                          </div>
                        </div>
                        <div className="row-right-actions">
                          <span className={`row-value-text ${isInc ? 'green' : ''}`}>{isInc ? '+' : ''}{parseFloat(item.Value).toLocaleString()} {item.lType === 'meter' ? 'egység' : 'Ft'}</span>
                          {!isReadOnly && (
                            <div className="row-buttons-trigger">
                              <button onClick={() => handleEditRecord(item)}>✏️</button>
                              <button onClick={async () => { if(window.confirm("Törlés?")) { await fetch(`${BACKEND_URL}/api/${item.lType === 'meter' ? 'records' : 'invoices'}/${item.Id || item.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` } }); fetchAll(user.token); } }}>❌</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================= TAB 3: BEÁLLÍTÁSOK (MÁTRIX ÉS TÁBLÁK) ================= */}
            {activeTab === 'settings' && (
              <div className="settings-split-dashboard">
                
                {/* 1. RÉSZ: ESZKÖZÖK ÉS AZOKNAK A KATEGÓRIÁI (MÁTRIX) */}
                <div className="ui-widget-card grid-span-full">
                  <h3 className="section-title-accent">⚙️ Eszközökhöz tartozó kategóriák beállítása (Adatbázis mátrix)</h3>
                  <p className="section-explain-text">Válaszd ki az eszközt a listából, majd jelöld be azokat a kategóriákat, amiket engedélyezni szeretnél hozzá. Így tiszta marad az adatbeviteli felület.</p>
                  
                  <div className="matrix-control-wrapper">
                    <div className="matrix-left-asset-list">
                      {assets.map((a: any) => (
                        <button 
                          key={a.Id} 
                          className={`matrix-asset-sidebar-item ${matrixSelectedAssetId === String(a.Id) ? 'active' : ''}`}
                          onClick={() => setMatrixSelectedAssetId(String(a.Id))}
                        >
                          <span>{a.Category === 'car' ? '🚗' : a.Category === 'person' ? '👤' : '🏠'} {a.FriendlyName}</span>
                          <small>({a.Category})</small>
                        </button>
                      ))}
                    </div>

                    <div className="matrix-right-checkbox-panel">
                      {matrixSelectedAssetId ? (
                        <>
                          <h4>Engedélyezett típusok ehhez: <span className="highlight-blue">{assets.find(a => String(a.Id) === matrixSelectedAssetId)?.FriendlyName}</span></h4>
                          <div className="checkbox-toggles-flex-grid">
                            {categories.map((c: any) => {
                              const isChecked = (assetCategoryMap[matrixSelectedAssetId] || []).includes(c.Name);
                              return (
                                <label key={c.Id} className={`checkbox-matrix-tile ${isChecked ? 'selected' : ''}`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked} 
                                    onChange={() => handleToggleCategoryForAsset(matrixSelectedAssetId, c.Name)}
                                  />
                                  <span className="tile-icon">{c.Icon}</span>
                                  <span className="tile-name">{c.Name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="empty-state-text">Válassz egy eszközt a bal oldali listából a kategóriák hozzárendeléséhez.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. RÉSZ: ÚJ ESZKÖZ LÉTREHOZÁSA */}
                <div className="ui-widget-card">
                  <h3 className="card-heading-clean">➕ Új eszköz / entitás hozzáadása</h3>
                  <div className="vertical-form mt-2">
                    <select value={newAsset.category} onChange={(e) => setNewAsset({...newAsset, category: e.target.value})}>
                      <option value="property">🏠 Ingatlan</option>
                      <option value="car">🚗 Jármű</option>
                      <option value="person">👤 Személy (Saját/Családtag)</option>
                    </select>
                    <input placeholder="Eszköz megnevezése (pl. Otthon, Toyota)" value={newAsset.friendlyName} onChange={(e) => setNewAsset({...newAsset, friendlyName: e.target.value})} />
                    <button className="btn-action-primary" onClick={handleAssetSave}>Eszköz mentése</button>
                  </div>
                </div>

                {/* 3. RÉSZ: HOGYAN OSZD MEG A CSALÁDDAL */}
                <div className="ui-widget-card">
                  <h3 className="card-heading-clean">🤝 Családi hozzáférések megosztása</h3>
                  <div className="flex-input-group mt-2">
                    <input type="email" placeholder="partner@gmail.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
                    <button className="btn-add-plus" onClick={handleShare}>+</button>
                  </div>
                  <div className="shares-static-list mt-3">
                    {myShares.map(s => (
                      <div key={s.id} className="share-list-row-item">
                        <span>{s.shared_with_email}</span>
                        <button className="flat-delete-btn" onClick={() => revokeShare(s.id)}>visszavonás</button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        ) : (
          <div className="auth-wrapper-centered">
            <div className="auth-hero-card">
              <h1 className="auth-title">Üdvözöl a <span className="gradient-text">Rezsiapp 2.0</span></h1>
              <p className="auth-subtitle">A háztartási rezsiköltségek és közüzemi óraállások letisztult, transzparens felülete.</p>
              <div className="auth-action-box">
                <div className="google-signin-btn-container">
                  <GoogleLogin onSuccess={(res) => handleLoginSuccess(res.credential!)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PRÉMIUM VILÁGOS SASS TÉMA (LIGHT ENGINE) --- */}
        <style>{`
          :root {
            --bg-main: #f8fafc;
            --bg-card: #ffffff;
            --bg-hover: #f1f5f9;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --accent: #4f46e5;
            --accent-hover: #4338ca;
            --border: #e2e8f0;
            --emerald: #10b981;
            --rose: #ef4444;
          }

          body {
            background-color: var(--bg-main);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0; padding: 0;
            font-size: 15px;
          }

          .app-container {
            max-width: 1300px;
            margin: 0 auto;
            padding: 20px;
            box-sizing: border-box;
          }

          /* --- MODERN PREMIUM HEADER --- */
          .app-header {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 12px 24px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);
          }

          .header-brand-section { display: flex; align-items: center; gap: 8px; }
          .header-brand-section h2 { margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.5px; }
          .version-tag { color: var(--accent); font-size: 0.8rem; }

          .header-navigation-tabs { display: flex; gap: 6px; }
          .nav-tab-link {
            background: transparent; border: none; padding: 10px 16px; font-size: 0.9rem;
            font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 10px;
            transition: all 0.2s;
          }
          .nav-tab-link:hover { background: var(--bg-hover); color: var(--text-main); }
          .nav-tab-link.active { background: #e0e7ff; color: var(--accent); }

          .header-user-badge { display: flex; align-items: center; gap: 12px; }
          .user-round-avatar { width: 36px; height: 36px; border-radius: 50%; border: 2px solid #c7d2fe; }
          .logout-trigger-btn { background: transparent; border: none; cursor: pointer; font-size: 1.2rem; }

          /* --- RE-DESIGNED LAYOUT GRID --- */
          .dashboard-layout-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
          }
          @media (min-width: 992px) {
            .dashboard-layout-grid { grid-template-columns: 320px 1fr; }
          }

          .sidebar-container { display: flex; flex-direction: column; gap: 20px; }
          .main-viewport-pane { min-width: 0; display: flex; flex-direction: column; gap: 20px; }

          /* --- CARDS & WIDGETS --- */
          .ui-widget-card {
            background: var(--bg-card); border-radius: 16px; padding: 20px;
            border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          }
          .compact-card { padding: 14px; }
          .card-heading-clean { margin: 0 0 16px 0; font-size: 1rem; font-weight: 700; }
          .input-label-flat { font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; display: block; }

          /* --- FORMS --- */
          .form-control-select, .vertical-form select, .vertical-form input, .flex-input-group input {
            width: 100%; padding: 12px; background: #f8fafc; border: 1px solid var(--border);
            border-radius: 10px; color: var(--text-main); font-size: 16px !important; box-sizing: border-box;
            outline: none; height: 46px;
          }
          .vertical-form { display: flex; flex-direction: column; gap: 10px; }

          .mode-toggle-pill { display: flex; background: #f1f5f9; padding: 4px; border-radius: 10px; gap: 4px; margin-bottom: 12px; }
          .pill-item { flex: 1; background: transparent; border: none; padding: 8px; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 8px; }
          .pill-item.active { background: white; color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

          .btn-action-primary {
            background: var(--accent); color: white; border: none; padding: 12px; border-radius: 10px;
            font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: background 0.2s;
          }
          .btn-action-primary:hover { background: var(--accent-hover); }

          .flex-input-group { display: flex; gap: 8px; }
          .btn-add-plus { background: var(--accent); border: none; color: white; width: 46px; height: 46px; border-radius: 10px; font-size: 1.2rem; cursor: pointer; }

          /* --- FIX CHIP GRID (NINCS TÖBBÉ ELVÁGVA) --- */
          .grid-wrapping-chips {
            display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;
          }
          .grid-chip-item {
            background: #f1f5f9; border: 1px solid var(--border); color: var(--text-main);
            padding: 10px 14px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
            display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;
          }
          .grid-chip-item:hover { background: #e2e8f0; }
          .grid-chip-item.active { box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

          .chart-filter-controls-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
          .compact-btn-group { display: flex; background: #f1f5f9; padding: 3px; border-radius: 20px; border: 1px solid var(--border); }
          .compact-btn-group button { background: transparent; border: none; color: var(--text-muted); padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
          .compact-btn-group button.active { background: white; color: var(--text-main); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
          .styled-range-select { background: #f1f5f9; border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; font-size: 0.75rem; }

          /* ================= MÁTRIX BEÁLLÍTÁSOK MENÜ ================= */
          .settings-split-dashboard {
            display: grid; grid-template-columns: 1fr; gap: 20px; text-align: left;
          }
          @media (min-width: 768px) {
            .settings-split-dashboard { grid-template-columns: 1fr 1fr; }
          }
          .grid-span-full { grid-column: 1 / -1; }
          .section-title-accent { margin-top: 0; font-size: 1.2rem; font-weight: 800; }
          .section-explain-text { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.4; }

          .matrix-control-wrapper {
            display: grid; grid-template-columns: 1fr; gap: 20px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
          }
          @media (min-width: 768px) {
            .matrix-control-wrapper { grid-template-columns: 240px 1fr; }
          }

          .matrix-left-asset-list { background: #f8fafc; border-right: 1px solid var(--border); padding: 12px; display: flex; flex-direction: column; gap: 6px; }
          .matrix-asset-sidebar-item {
            display: flex; flex-direction: column; text-align: left; padding: 12px; border: 1px solid transparent; background: transparent; border-radius: 8px; cursor: pointer;
          }
          .matrix-asset-sidebar-item:hover { background: #e2e8f0; }
          .matrix-asset-sidebar-item.active { background: white; border-color: var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
          .matrix-asset-sidebar-item strong { font-size: 0.95rem; }
          .matrix-asset-sidebar-item small { color: var(--text-muted); font-size: 0.75rem; margin-top: 2px; }

          .matrix-right-checkbox-panel { padding: 20px; background: white; }
          .matrix-right-checkbox-panel h4 { margin-top: 0; margin-bottom: 16px; font-size: 1rem; }
          .highlight-blue { color: var(--accent); font-weight: 700; }

          .checkbox-toggles-flex-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;
          }
          .checkbox-matrix-tile {
            display: flex; align-items: center; gap: 10px; padding: 12px; background: #f8fafc;
            border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: all 0.2s;
          }
          .checkbox-matrix-tile input { width: 18px; height: 18px; cursor: pointer; margin: 0; }
          .checkbox-matrix-tile.selected { background: #e0e7ff; border-color: #a5b4fc; font-weight: 600; }
          .tile-icon { font-size: 1.1rem; }
          .tile-name { font-size: 0.85rem; }

          /* --- TRANZAKCIÓS LISTA (DEDIKÁLT TAB) --- */
          .fullwidth-list-view { text-align: left; }
          .list-title-header-row { margin-bottom: 16px; }
          .modern-data-table-stack { display: flex; flex-direction: column; gap: 8px; }
          .table-row-card {
            background: white; border: 1px solid var(--border); border-radius: 12px; padding: 14px 20px;
            display: flex; justify-content: space-between; align-items: center; gap: 15px;
          }
          .row-left-info { display: flex; align-items: center; gap: 16px; }
          .row-badge-type { background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); }
          .row-main-title { font-weight: 700; font-size: 0.95rem; }
          .row-sub-title { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
          .row-right-actions { display: flex; align-items: center; gap: 16px; }
          .row-value-text { font-weight: 700; font-size: 1rem; color: var(--text-main); }
          .row-value-text.green { color: var(--emerald); }
          .row-buttons-trigger button { background: #f1f5f9; border: 1px solid var(--border); padding: 6px; border-radius: 6px; cursor: pointer; margin-left: 4px; }

          /* --- MEGOSZTÁSOK LISTÁJA --- */
          .share-list-row-item { display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; font-size: 0.85rem; }
          .flat-delete-btn { background: transparent; border: none; color: var(--rose); cursor: pointer; font-size: 0.8rem; }

          /* --- CUSTOM TOOLTIP --- */
          .custom-tooltip-box { background: white; padding: 12px; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); font-size: 13px; }
          .tooltip-title { margin: 0 0 6px 0; font-weight: bold; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
          .tooltip-row { display: flex; justify-content: space-between; gap: 16px; }

          /* --- AUTH PANELEK --- */
          .auth-wrapper-centered { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
          .auth-hero-card { background: white; border: 1px solid var(--border); max-width: 420px; padding: 32px; border-radius: 20px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
          .auth-title { font-size: 1.6rem; margin-top: 0; }
          .auth-subtitle { color: var(--text-muted); font-size: 0.9rem; line-height: 1.4; }
          .auth-action-box { background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid var(--border); margin-top: 20px; }
          .google-signin-btn-container { display: flex; justify-content: center; }
        `}</style>
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;
