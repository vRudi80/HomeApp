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
  
  // Tranzakciók oldali szűrők állapotai
  const [txSearch, setTxSearch] = useState('');
  const [txAssetFilter, setTxAssetFilter] = useState('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');
  
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

  const isReadOnly = viewingUserId !== null && viewingUserId !== user?.sub;

  useEffect(() => {
    if (assets.length > 0 && !matrixSelectedAssetId) {
      setMatrixSelectedAssetId(String(assets[0].Id));
    }
  }, [assets]);

  // Biztonsági szűrő: Ha az eszközhöz nem tartozik a kiválasztott főkategória-chip, állítsuk vissza Összesre
  useEffect(() => {
    const allowed = getAllowedTypes(selectedAssetId);
    if (filter !== 'Összes' && filter !== 'Összes kiadás' && !allowed.includes(filter)) {
      setFilter('Összes');
    }
  }, [selectedAssetId, assetCategoryMap]);

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
      } else {
        alert("Szerver hiba a mátrix mentésekor. Ellenőrizd a kapcsolótáblát az adatbázisban!");
      }
    } catch (e) {
      console.error(e);
    }
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

  // Intelligens kategória engedélyezési szűrő az eszközhöz (Fallback logikával)
  const getAllowedTypes = (assetId: string) => {
    const allCatNames = categories.map(c => c.Name);
    if (!assetId || assetId === 'all') return allCatNames;
    
    if (assetCategoryMap[assetId] && assetCategoryMap[assetId].length > 0) {
      return assetCategoryMap[assetId];
    }
    
    const asset = assets.find((a: any) => String(a.Id) === String(assetId));
    if (asset) {
      if (asset.Category === 'car') {
        return allCatNames.filter(name => ['Üzemanyag', 'Biztosítás', 'Szerviz', 'Egyéb'].includes(name));
      }
      if (asset.Category === 'property') {
        return allCatNames.filter(name => !['Üzemanyag', 'Fizetés', 'Túrájó', 'Fotózás'].includes(name));
      }
      if (asset.Category === 'person') {
        return allCatNames.filter(name => ['Fizetés', 'Túrájó', 'Fotózás', 'Mobiltelefon', 'Internet', 'Egyéb'].includes(name));
      }
    }
    return allCatNames;
  };

  // Dinamikusan szűrt kategóriák a grafikon feletti chipekhez
  const visibleCategories = useMemo(() => {
    const allowedNames = getAllowedTypes(selectedAssetId);
    return categories.filter(c => allowedNames.includes(c.Name));
  }, [categories, selectedAssetId, assetCategoryMap]);

  // --- 1. ALAP TRANZAKCIÓS LISTA ÖSSZEÁLLÍTÁSA (Függőségek rendezve és optimalizálva) ---
  const combinedList = useMemo(() => {
    return [
      ...(filter === 'Összes' || filter === 'Összes kiadás' ? [] : records.filter(r => (selectedAssetId === 'all' || String(r.AssetId) === String(selectedAssetId)) && r.Type === filter).map(r => ({ ...r, lType: 'meter', d: r.FormattedDate }))),
      ...invoices.filter(i => {
        if (selectedAssetId !== 'all' && String(i.AssetId) !== String(selectedAssetId)) return false;
        if (filter === 'Összes') return true;
        if (filter === 'Összes kiadás') return categories.find(c => c.Name === i.Type)?.Type !== 'income';
        return i.Type === filter;
      }).map(i => ({ ...i, lType: 'invoice', Value: i.Amount, d: i.Month }))
    ].sort((a, b) => new Date(b.d).getTime() - new Date(a.d).getTime());
  }, [records, invoices, selectedAssetId, filter, categories]);

  // --- 2. KUTATÁS ÉS SZŰRÉS A TRANZAKCIÓK LAPFÜLÖN (Szigorúan a combinedList deklarációja után) ---
  const filteredCombinedList = useMemo(() => {
    return combinedList.filter((item: any) => {
      const asset = assets.find(a => String(a.Id) === String(item.AssetId));
      const assetName = asset ? asset.FriendlyName.toLowerCase() : '';
      const itemType = item.Type.toLowerCase();
      
      const searchMatch = 
        itemType.includes(txSearch.toLowerCase()) || 
        assetName.includes(txSearch.toLowerCase()) || 
        String(item.Value).includes(txSearch);
        
      const assetMatch = txAssetFilter === 'all' || String(item.AssetId) === txAssetFilter;
      const categoryMatch = txCategoryFilter === 'all' || item.Type === txCategoryFilter;
      
      return searchMatch && assetMatch && categoryMatch;
    });
  }, [combinedList, txSearch, txAssetFilter, txCategoryFilter, assets]);

  // --- GRAFIKON ADATOK GENERÁLÁSA ---
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
    return chartRange === 'custom' 
      ? sorted.filter((item: any) => item.label >= customStartDate && item.label <= customEndDate)
      : (chartRange === 'all' ? sorted : sorted.slice(-chartRange));
  }, [records, invoices, assets, filter, displayMode, viewMode, selectedAssetId, chartRange, customStartDate, customEndDate]);

  // --- INTUITÍV GRAFIKON TOOLTIP ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const unit = displayMode === 'cost' ? 'Ft' : '';
      if (displayMode === 'usage') {
        const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry.value) || 0), 0);
        return (
          <div className="custom-tooltip-box">
            <p className="tooltip-title">{label}</p>
            {payload.map((entry: any, index: number) => (
              <div key={index} className="tooltip-row">
                <span style={{ color: entry.color }}>{entry.name}:</span>
                <span className="tooltip-val">{Number(entry.value).toLocaleString()} {unit}</span>
              </div>
            ))}
            <div className="tooltip-total font-emerald">
              <span>Összesen:</span><span>{total.toLocaleString()} {unit}</span>
            </div>
          </div>
        );
      }

      const expenses = payload.filter((p: any) => !p.dataKey.endsWith('_income'));
      const incomes = payload.filter((p: any) => p.dataKey.endsWith('_income'));
      const totalExp = expenses.reduce((sum: number, p: any) => sum + Number(p.value), 0);
      const totalInc = incomes.reduce((sum: number, p: any) => sum + Number(p.value), 0);
      const netTotal = totalInc - totalExp;

      return (
        <div className="custom-tooltip-box">
          <p className="tooltip-title">{label}</p>
          {incomes.length > 0 && (
            <div className="tooltip-section">
              <div className="section-badge badge-income">Bevételek</div>
              {incomes.map((entry: any, index: number) => (
                <div key={`inc-${index}`} className="tooltip-row">
                  <span style={{ color: entry.color }}>{entry.name.replace(' (Bevétel)', '')}:</span>
                  <span className="font-emerald">+{Number(entry.value).toLocaleString()} {unit}</span>
                </div>
              ))}
            </div>
          )}

          {expenses.length > 0 && (
            <div className="tooltip-section">
              <div className="section-badge badge-expense">Kiadások</div>
              {expenses.map((entry: any, index: number) => (
                <div key={`exp-${index}`} className="tooltip-row">
                  <span style={{ color: entry.color }}>{entry.name}:</span>
                  <span>{Number(entry.value).toLocaleString()} {unit}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="tooltip-footer">
            {totalExp > 0 && <div className="tooltip-row font-rose"><span>Össz. Kiadás:</span><span>-{totalExp.toLocaleString()} {unit}</span></div>}
            {totalInc > 0 && <div className="tooltip-row font-emerald"><span>Össz. Bevétel:</span><span>+{totalInc.toLocaleString()} {unit}</span></div>}
            <div className="tooltip-net" style={{ color: netTotal > 0 ? '#10b981' : (netTotal < 0 ? '#ef4444' : '#0f172a') }}>
              <span>Egyenleg:</span><span>{netTotal > 0 ? '+' : ''}{netTotal.toLocaleString()} {unit}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // --- FUNKCIÓK RÖGZÍTÉSE ---
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
    const cat = categories.find(c => c.Name === t);
    return cat ? cat.Icon : '📄';
  };

  const getColor = (t: string = filter) => {
    if (displayMode === 'cost' && t !== 'Összes' && t !== 'Összes kiadás') return '#10b981';
    if (t === 'Összes') return '#4f46e5'; if (t === 'Összes kiadás') return '#ef4444';
    switch(t) {
      case 'Áram': return '#f59e0b';
      case 'Víz': return '#06b6d4';
      case 'Gáz': return '#f97316';
      case 'Üzemanyag': return '#8b5cf6';
      case 'Internet': return '#ec4899';
      case 'Szemétszállítás': return '#64748b';
      case 'Albérlet': return '#db2777';
      default: 
        let hash = 0;
        for (let i = 0; i < t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${hash % 360}, 65%, 55%)`;
    }
  };

  const handleEditRecord = (item: any) => {
    setEditingRecordId(item.Id || item.id);
    setEditingRecordLType(item.lType);
    setRecordMode(item.lType);
    setTargetAssetId(String(item.AssetId));
    setType(item.Type);
    setValue(String(item.Value || item.Amount || ''));
    
    const dateStr = String(item.d).substring(0, 10);
    if (item.lType === 'meter') setMeterDate(dateStr);
    else setInvoiceDate(dateStr);
    setActiveTab('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelRecordEdit = () => {
    setEditingRecordId(null);
    setEditingRecordLType(null);
    setValue('');
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="app-container">
        
        {/* --- HEADER SÁV --- */}
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
                
                {/* BAL OLDALSÁV */}
                <aside className="sidebar-container">
                  <div className="ui-widget-card">
                    <label className="input-label-flat">Eszköz gyorsválasztó</label>
                    <select className="form-control-select" value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
                      <option value="all">🌐 Összesített nézet</option>
                      {assets.map((a: any) => (
                        <option key={a.Id} value={String(a.Id)}>{a.Category === 'car' ? '🚗' : a.Category === 'person' ? '👤' : '🏠'} {a.FriendlyName}</option>
                      ))}
                    </select>
                  </div>

                  {!isReadOnly && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">{editingRecordId ? "✏️ Tranzakció szerkesztése" : "Új adat hozzáadása"}</h3>
                      <div className="mode-toggle-pill">
                        <button className={`pill-item ${recordMode === 'meter' ? 'active' : ''}`} onClick={() => setRecordMode('meter')} disabled={editingRecordId !== null}>📟 Óraállás</button>
                        <button className={`pill-item ${recordMode === 'invoice' ? 'active' : ''}`} onClick={() => setRecordMode('invoice')} disabled={editingRecordId !== null}>💰 Számla</button>
                      </div>
                      <div className="form-stack-vertical">
                        <select className="form-control-select" value={targetAssetId} onChange={(e) => setTargetAssetId(e.target.value)}>
                          <option value="">Eszköz választás...</option>
                          {assets.map((a: any) => (<option key={a.Id} value={String(a.Id)}>{a.FriendlyName}</option>))}
                        </select>
                        <select className="form-control-select" value={type} onChange={(e) => setType(e.target.value)}>
                          {getAllowedTypes(targetAssetId).map(t => <option key={t} value={t}>{getIcon(t)} {t}</option>)}
                        </select>
                        <input className="form-control-select" type="date" value={recordMode === 'meter' ? meterDate : invoiceDate} onChange={(e) => recordMode === 'meter' ? setMeterDate(e.target.value) : setInvoiceDate(e.target.value)} />
                        <input className="form-control-select" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Érték (egység / Ft)" />
                        
                        <div className="action-buttons-row">
                          <button className="btn-submit-form" onClick={handleSave} disabled={!targetAssetId || targetAssetId === 'all' || !value}>
                            {editingRecordId ? 'Módosítás mentése' : 'Adat mentése'}
                          </button>
                          {editingRecordId && <button className="btn-action-primary" style={{backgroundColor: '#64748b'}} onClick={cancelRecordEdit}>Mégse</button>}
                        </div>
                      </div>
                    </div>
                  )}
                </aside>

                {/* JOBB OLDAL */}
                <section className="main-viewport-pane">
                  <div className="ui-widget-card">
                    <div className="grid-wrapping-chips">
                      <button className={`grid-chip-item ${filter === 'Összes' ? 'active' : ''}`} onClick={() => setFilter('Összes')} style={filter === 'Összes' ? {backgroundColor: getColor('Összes'), color:'white'} : {}}>📊 Összesen</button>
                      {displayMode === 'cost' && (
                        <button className={`grid-chip-item ${filter === 'Összes kiadás' ? 'active' : ''}`} onClick={() => setFilter('Összes kiadás')} style={filter === 'Összes kiadás' ? {backgroundColor: getColor('Összes kiadás'), color:'white'} : {}}>📉 Összes kiadás</button>
                      )}
                      {visibleCategories.map(c => (
                        <button key={c.Id} className={`grid-chip-item ${filter === c.Name ? 'active' : ''}`} onClick={() => setFilter(c.Name)} style={filter === c.Name ? {backgroundColor: getColor(c.Name), color: 'white'} : {}}>{c.Icon} {c.Name}</button>
                      ))}
                    </div>

                    <div className="chart-filter-controls-row">
                      <div className="controls-left-side-modes">
                        <div className="compact-btn-group">
                          <button className={displayMode === 'usage' ? 'active' : ''} disabled={filter === 'Összes' || filter === 'Összes kiadás'} onClick={() => setDisplayMode('usage')}>Fogyasztás</button>
                          <button className={displayMode === 'cost' ? 'active' : ''} onClick={() => setDisplayMode('cost')}>Költség</button>
                        </div>
                        <div className="compact-btn-group">
                          <button className={viewMode === 'monthly' ? 'active' : ''} onClick={() => setViewMode('monthly')}>Havi</button>
                          <button className={viewMode === 'annual' ? 'active' : ''} onClick={() => setViewMode('annual')}>Éves</button>
                        </div>
                      </div>

                      <div className="controls-right-side-dates">
                        <select className="form-control-select styled-range-select" value={chartRange} onChange={(e) => { const val = e.target.value; setChartRange(val === 'all' || val === 'custom' ? val : parseInt(val)); }}>
                          {viewMode === 'monthly' && <option value={6}>Utolsó 6 hónap</option>}
                          {viewMode === 'monthly' && <option value={12}>Utolsó 12 hónap</option>}
                          {viewMode === 'monthly' && <option value={24}>Utolsó 24 hónap</option>}
                          <option value="all">Minden korábbi adat</option>
                          <option value="custom">Egyedi időszak...</option>
                        </select>

                        {chartRange === 'custom' && (
                          <div className="custom-range-inputs-wrapper">
                            <input type="month" className="small-date-input" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
                            <span className="date-separator">-</span>
                            <input type="month" className="small-date-input" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ui-widget-card">
                     <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" fontSize={11} stroke="#64748b" tickLine={false} />
                      <YAxis fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }} />
                      
                      {(selectedAssetId === 'all' ? assets : assets.filter(a => String(a.Id) === String(selectedAssetId))).map((asset, idx) => {
                        const color = selectedAssetId === 'all' ? ASSET_COLORS[idx % ASSET_COLORS.length] : getColor();
                        return (
                          <React.Fragment key={asset.Id}>
                            <Bar dataKey={asset.FriendlyName} stackId="expense" fill={color} radius={[3, 3, 0, 0]} />
                            <Bar 
                              dataKey={`${asset.FriendlyName}_income`} 
                              name={`${asset.FriendlyName} (Bevétel)`} 
                              stackId="income" 
                              fill={color} 
                              opacity={0.4} 
                              legendType="none" 
                            />
                          </React.Fragment>
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </section>
              </div>
            )}

            {/* ================= TAB 2: TRANZAKCIÓK KERESŐVEL ÉS SZŰRŐKKEL ================= */}
            {activeTab === 'transactions' && (
              <div className="fullwidth-list-view">
                <div className="list-title-header-row">
                  <h3>Tranzakciók keresése és kezelése</h3>
                </div>

                <div className="ui-widget-card search-filter-card-wrapper">
                  <div className="search-filter-grid-layout">
                    <input 
                      type="text" 
                      placeholder="🔍 Keresés típusra, eszközre vagy értékre..." 
                      value={txSearch} 
                      onChange={(e) => setTxSearch(e.target.value)} 
                      className="form-control-select"
                    />
                    <select value={txAssetFilter} onChange={(e) => setTxAssetFilter(e.target.value)} className="form-control-select">
                      <option value="all">Minden eszköz szűrése</option>
                      {assets.map((a: any) => (<option key={a.Id} value={String(a.Id)}>{a.FriendlyName}</option>))}
                    </select>
                    <select value={txCategoryFilter} onChange={(e) => setTxCategoryFilter(e.target.value)} className="form-control-select">
                      <option value="all">Minden kategória szűrése</option>
                      {categories.map((c: any) => (<option key={c.Id} value={c.Name}>{c.Icon} {c.Name}</option>))}
                    </select>
                  </div>
                </div>

                <div className="modern-data-table-stack">
                  {filteredCombinedList.map((item: any, idx) => {
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
                          <span className={`row-value-text ${isInc ? 'green' : 'expense-dark'}`}>{isInc ? '+' : ''}{parseFloat(item.Value).toLocaleString()} {item.lType === 'meter' ? 'egység' : 'Ft'}</span>
                          {!isReadOnly && (
                            <div className="row-buttons-trigger">
                              <button onClick={() => handleEditRecord(item)}>✏️</button>
                              <button onClick={async () => { if(window.confirm("Biztosan törlöd?")) { await fetch(`${BACKEND_URL}/api/${item.lType === 'meter' ? 'records' : 'invoices'}/${item.Id || item.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` } }); fetchAll(user.token); } }}>❌</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredCombinedList.length === 0 && <div className="empty-state-text">Nincs a szűrésnek megfelelő tranzakció az adatbázisban.</div>}
                </div>
              </div>
            )}

            {/* ================= TAB 3: BEÁLLÍTÁSOK ================= */}
            {activeTab === 'settings' && (
              <div className="settings-split-dashboard">
                <div className="ui-widget-card grid-span-full">
                  <h3 className="section-title-accent">⚙️ Eszközökhöz tartozó kategóriák beállítása (Adatbázis mátrix)</h3>
                  <p className="section-explain-text">Kattints egy eszközre a bal oldalon, majd a jobb oldali rácsban pipáld be azokat a kategóriákat, amik engedélyezettek hozzá.</p>
                  
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

                <div className="ui-widget-card">
                  <h3 className="card-heading-clean">➕ Új eszköz / entitás hozzáadása</h3>
                  <div className="vertical-form mt-2">
                    <select className="form-control-select" value={newAsset.category} onChange={(e) => setNewAsset({...newAsset, category: e.target.value})}>
                      <option value="property">🏠 Ingatlan</option>
                      <option value="car">🚗 Jármű</option>
                      <option value="person">👤 Személy</option>
                    </select>
                    <input className="form-control-select" placeholder="Eszköz megnevezése (pl. Otthon, Toyota)" value={newAsset.friendlyName} onChange={(e) => setNewAsset({...newAsset, friendlyName: e.target.value})} />
                    <button className="btn-action-primary" onClick={handleAssetSave}>Eszköz mentése</button>
                  </div>
                </div>

                <div className="ui-widget-card">
                  <h3 className="card-heading-clean">🤝 Családi hozzáférések megosztása</h3>
                  <div className="flex-input-group mt-2">
                    <input className="form-control-select" type="email" placeholder="partner@gmail.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
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
              <p className="auth-subtitle">Háztartási költségeid és mérőóráid letisztult, világos kezelőfelülete.</p>
              <div className="auth-action-box">
                <div className="google-signin-btn-container">
                  <GoogleLogin onSuccess={(res) => handleLoginSuccess(res.credential!)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PREMIUM LIGHT-THEME STYLING ENGINE --- */}
        <style>{`
          :root {
            --bg-main: #f8fafc;
            --bg-card: #ffffff;
            --bg-hover: #f1f5f9;
            --text-main: #0f172a;
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
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
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

          .ui-widget-card {
            background: var(--bg-card); border-radius: 16px; padding: 20px;
            border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.01);
          }
          .card-heading-clean { margin: 0 0 16px 0; font-size: 1rem; font-weight: 700; }
          .input-label-flat { font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; display: block; }

          /* --- ANTI-90S PREMIUM INPUTS & DROPDOWNS ENGINE --- */
          .form-control-select, .vertical-form input {
            width: 100%; padding: 11px 14px; background: #ffffff; border: 1px solid var(--border);
            border-radius: 10px; color: var(--text-main); font-size: 15px !important; box-sizing: border-box;
            outline: none; height: 46px; transition: all 0.2s ease-in-out;
            appearance: none; -webkit-appearance: none;
            box-shadow: 0 1px 2px rgba(0,0,0,0.02);
          }
          select.form-control-select {
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat; background-position: right 14px center; background-size: 15px;
            padding-right: 40px !important; cursor: pointer;
          }
          .form-control-select:focus, .vertical-form input:focus {
            border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08); background-color: #ffffff;
          }
          .form-stack-vertical { display: flex; flex-direction: column; gap: 12px; }
          .action-buttons-row { display: flex; gap: 8px; }

          .mode-toggle-pill { display: flex; background: #f1f5f9; padding: 4px; border-radius: 10px; gap: 4px; margin-bottom: 4px; }
          .pill-item { flex: 1; background: transparent; border: none; padding: 8px; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 8px; }
          .pill-item.active { background: white; color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
          .pill-item:disabled { opacity: 0.5; cursor: not-allowed; }

          .btn-submit-form, .btn-action-primary {
            background: var(--emerald); color: white; border: none; padding: 12px; border-radius: 10px;
            font-weight: 700; font-size: 0.95rem; cursor: pointer; height: 46px; transition: opacity 0.2s; text-align: center; width: 100%;
          }
          .btn-action-primary { background: var(--accent); }
          .btn-submit-form:disabled { opacity: 0.4; cursor: not-allowed; }

          .flex-input-group { display: flex; gap: 8px; }
          .btn-add-plus { background: var(--accent); border: none; color: white; width: 46px; height: 46px; border-radius: 10px; font-size: 1.2rem; cursor: pointer; }

          .grid-wrapping-chips { display: flex; flex-wrap: wrap; gap: 6px; }
          .grid-chip-item {
            background: #f1f5f9; border: 1px solid var(--border); color: var(--text-main);
            padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
            display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;
          }
          .grid-chip-item:hover { background: #e2e8f0; }

          .chart-filter-controls-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
          .controls-left-side-modes { display: flex; gap: 8px; }
          .controls-right-side-dates { display: flex; align-items: center; gap: 8px; }
          .compact-btn-group { display: flex; background: #f1f5f9; padding: 3px; border-radius: 20px; border: 1px solid var(--border); }
          .compact-btn-group button { background: transparent; border: none; color: var(--text-muted); padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
          .compact-btn-group button:disabled { opacity: 0.4; cursor: not-allowed; }
          .compact-btn-group button.active { background: white; color: var(--text-main); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
          
          .styled-range-select { height: 36px; padding: 4px 32px 4px 14px; font-size: 0.8rem !important; border-radius: 20px; width: auto; background-position: right 10px center; }
          .custom-range-inputs-wrapper { display: flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border); height: 36px; box-sizing: border-box; }
          .small-date-input { background: transparent; border: none; font-size: 0.8rem; outline: none; color: var(--text-main); cursor: pointer; font-family: inherit; }
          .date-separator { color: var(--text-muted); font-size: 0.8rem; }

          /* ================= TRANZAKCIÓK ENGINE ================= */
          .search-filter-card-wrapper { margin-bottom: 16px; padding: 14px !important; }
          .search-filter-grid-layout { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
          @media (max-width: 768px) { .search-filter-grid-layout { grid-template-columns: 1fr; } }

          /* ================= BEÁLLÍTÁSOK MATRIX ================= */
          .settings-split-dashboard { display: grid; grid-template-columns: 1fr; gap: 20px; text-align: left; }
          @media (min-width: 768px) { .settings-split-dashboard { grid-template-columns: 1fr 1fr; } }
          .grid-span-full { grid-column: 1 / -1; }
          .section-title-accent { margin-top: 0; font-size: 1.1rem; font-weight: 800; }
          .section-explain-text { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.4; }
          .matrix-control-wrapper { display: grid; grid-template-columns: 1fr; gap: 20px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
          @media (min-width: 768px) { .matrix-control-wrapper { grid-template-columns: 220px 1fr; } }
          .matrix-left-asset-list { background: #f8fafc; border-right: 1px solid var(--border); padding: 10px; display: flex; flex-direction: column; gap: 4px; }
          .matrix-asset-sidebar-item { display: flex; flex-direction: column; text-align: left; padding: 10px; border: 1px solid transparent; background: transparent; border-radius: 8px; cursor: pointer; }
          .matrix-asset-sidebar-item:hover { background: #e2e8f0; }
          .matrix-asset-sidebar-item.active { background: white; border-color: var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
          .matrix-asset-sidebar-item small { color: var(--text-muted); font-size: 0.7rem; }
          .matrix-right-checkbox-panel { padding: 16px; background: white; }
          .matrix-right-checkbox-panel h4 { margin-top: 0; margin-bottom: 14px; font-size: 0.95rem; }
          .highlight-blue { color: var(--accent); font-weight: 700; }
          .checkbox-toggles-flex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
          .checkbox-matrix-tile { display: flex; align-items: center; gap: 8px; padding: 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
          .checkbox-matrix-tile input { width: 16px; height: 16px; margin: 0; cursor: pointer; }
          .checkbox-matrix-tile.selected { background: #e0e7ff; border-color: #a5b4fc; font-weight: 600; }
          .tile-icon { font-size: 1.1rem; }
          .tile-name { font-size: 0.85rem; }

          /* --- TABLES --- */
          .fullwidth-list-view { text-align: left; }
          .modern-data-table-stack { display: flex; flex-direction: column; gap: 6px; }
          .table-row-card { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; }
          .row-left-info { display: flex; align-items: center; gap: 12px; }
          .row-badge-type { background: #f1f5f9; padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
          .row-main-title { font-weight: 700; font-size: 0.9rem; }
          .row-sub-title { font-size: 0.75rem; color: var(--text-muted); }
          .row-right-actions { display: flex; align-items: center; gap: 12px; }
          .row-value-text { font-weight: 700; font-size: 0.95rem; }
          .row-value-text.green { color: var(--emerald); }
          .expense-dark { color: var(--text-main); }
          .row-buttons-trigger button { background: #f1f5f9; border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-left: 4px; }
          .empty-state-text { text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.9rem; }

          .share-list-row-item { display: flex; justify-content: space-between; padding: 8px; background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; }
          .flat-delete-btn { background: transparent; border: none; color: var(--rose); cursor: pointer; }
          .custom-tooltip-box { background: white; padding: 10px; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.06); font-size: 12px; }
          .tooltip-title { margin: 0 0 4px 0; font-weight: bold; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
          .tooltip-row { display: flex; justify-content: space-between; gap: 12px; }
          .font-emerald { color: var(--emerald); }
          .font-rose { color: var(--rose); }
          .auth-wrapper-centered { display: flex; justify-content: center; align-items: center; min-height: 50vh; }
          .auth-hero-card { background: white; border: 1px solid var(--border); padding: 30px; border-radius: 16px; }
          .gradient-text { color: var(--accent); font-weight: 800; }
        `}</style>
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;
