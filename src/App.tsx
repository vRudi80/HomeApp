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
  
  const [recordMode, setRecordMode] = useState<'meter' | 'invoice'>('meter');
  const [targetAssetId, setTargetAssetId] = useState('');
  const [type, setType] = useState('');
  const [value, setValue] = useState('');
  const [meterDate, setMeterDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
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

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);
  const isReadOnly = viewingUserId !== null && viewingUserId !== user?.sub;

  // --- API LEKÉRDEZÉSEK ---
  const fetchMyShares = async (token: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/shares/owned`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setMyShares(await res.json());
    } catch (e) { console.error("Hiba a megosztások betöltésekor", e); }
  };

  const fetchSharedAccounts = async (token: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/shares/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setSharedUsers(await res.json());
    } catch (e) { console.error("Hiba a megosztások lekérésekor", e); }
  };

  const fetchAll = async (token: string, targetId?: string) => {
    const id = targetId || viewingUserId || user?.sub;
    if (!id || !token) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [recRes, invRes, assetRes, catRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/records?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/invoices?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/assets?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/categories?userId=${id}`, { headers })
      ]);
      if (recRes.status === 401) return forceLogout();
      
      const recData = await recRes.json();
      const invData = await invRes.json();
      const astData = await assetRes.json();
      const catData = await catRes.json();
      
      setRecords(Array.isArray(recData) ? recData : []);
      setInvoices(Array.isArray(invData) ? invData : []);
      setAssets(Array.isArray(astData) ? astData : []);
      
      const loadedCategories = Array.isArray(catData) ? catData : [];
      setCategories(loadedCategories);
      if (loadedCategories.length > 0 && !type) {
        setType(loadedCategories[0].Name);
      }
    } catch (err) { console.error("Adatlekérési hiba", err); }
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
    } catch (e) {
      console.error("Hiba a bejelentkezésnél", e);
      forceLogout();
    }
  };

  const forceLogout = () => {
    googleLogout();
    setUser(null);
    setRecords([]); setInvoices([]); setAssets([]); setCategories([]);
    setSharedUsers([]); setMyShares([]);
    localStorage.removeItem('userToken');
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('userToken');
    if (savedToken) handleLoginSuccess(savedToken);
  }, []);

  const getAllowedTypes = (assetId: string) => {
    const allCatNames = categories.map(c => c.Name);
    if (!assetId || assetId === 'all') return allCatNames;
    const asset = assets.find((a: any) => String(a.Id) === String(assetId));
    if (asset?.Category === 'property' || asset?.Category === 'person') return allCatNames;
    return allCatNames.includes('Üzemanyag') ? ['Üzemanyag'] : allCatNames;
  };

  useEffect(() => {
    if (selectedAssetId !== 'all') {
      if (!editingRecordId) setTargetAssetId(selectedAssetId);
      const asset = assets.find(a => String(a.Id) === String(selectedAssetId));
      if (asset?.Category === 'car') {
        if (categories.find(c => c.Name === 'Üzemanyag')) setFilter('Üzemanyag');
        setDisplayMode('cost');
      }
    } else {
      setFilter('Összes');
      setDisplayMode('cost');
    }
  }, [selectedAssetId, assets.length, categories, editingRecordId]);

  useEffect(() => {
    const asset = assets.find(a => String(a.Id) === String(targetAssetId));
    const allowed = getAllowedTypes(targetAssetId);
    const currentCat = categories.find(c => c.Name === type);
    
    if (!editingRecordId) {
      if (asset?.Category === 'car' || currentCat?.Type === 'invoice_only' || currentCat?.Type === 'income') {
        setRecordMode('invoice');
      }
    }
    if (allowed.length > 0 && !allowed.includes(type)) setType(allowed[0]);
  }, [targetAssetId, type, assets, categories, editingRecordId]);

  // --- GRAFIKON ADATOK ELŐKÉSZÍTÉSE ---
  const chartData = useMemo(() => {
    const dataMap: { [key: string]: any } = {};
    const fRec = records.filter((r: any) => selectedAssetId === 'all' || String(r.AssetId) === String(selectedAssetId));
    const fInv = invoices.filter((i: any) => selectedAssetId === 'all' || String(i.AssetId) === String(selectedAssetId));

    if (displayMode === 'usage') {
      const assetsMap: { [key: string]: any[] } = {};
      fRec.filter((r: any) => {
        if (filter === 'Összes' || filter === 'Összes kiadás') return true;
        return r.Type === filter;
      }).forEach((r: any) => {
        if (!assetsMap[r.AssetId]) assetsMap[r.AssetId] = [];
        assetsMap[r.AssetId].push(r);
      });

      Object.keys(assetsMap).forEach(assetId => {
        const filtered = assetsMap[assetId].sort((a: any, b: any) => new Date(a.FormattedDate).getTime() - new Date(b.FormattedDate).getTime());
        for (let i = 1; i < filtered.length; i++) {
          const diff = parseFloat(filtered[i].Value) - parseFloat(filtered[i-1].Value);
          if (diff >= 0) {
            const t1 = new Date(filtered[i-1].FormattedDate).getTime();
            const t2 = new Date(filtered[i].FormattedDate).getTime();
            const midDate = new Date(t1 + (t2 - t1) / 2);
            const year = midDate.getFullYear();
            const month = String(midDate.getMonth() + 1).padStart(2, '0');
            const key = viewMode === 'monthly' ? `${year}-${month}` : `${year}`;
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
        if (filter === 'Összes kiadás') {
          const isInc = categories.find(c => c.Name === inv.Type)?.Type === 'income';
          return !isInc;
        }
        return inv.Type === filter;
      }).forEach((inv: any) => {
        const key = String(inv.Month || "").substring(0, keyLen);
        const asset = assets.find(a => String(a.Id) === String(inv.AssetId));
        const label = asset ? asset.FriendlyName : 'Egyéb';
        const isIncome = categories.find(c => c.Name === inv.Type)?.Type === 'income';
        const amount = parseFloat(inv.Amount || 0);

        if (key && key.length >= 4) {
          if (!dataMap[key]) dataMap[key] = { label: key };
          if (isIncome) {
            const incomeKey = `${label}_income`;
            dataMap[key][incomeKey] = (dataMap[key][incomeKey] || 0) + amount;
          } else {
            dataMap[key][label] = (dataMap[key][label] || 0) + amount;
          }
        }
      });
    }
    
    const sortedData = Object.values(dataMap).sort((a: any, b: any) => a.label.localeCompare(b.label));
    if (chartRange === 'custom') {
      return sortedData.filter((item: any) => {
        const itemDate = item.label; 
        const start = viewMode === 'annual' ? customStartDate.substring(0, 4) : customStartDate;
        const end = viewMode === 'annual' ? customEndDate.substring(0, 4) : customEndDate;
        return itemDate >= (start || '0000') && itemDate <= (end || '9999');
      });
    }

    if (viewMode === 'monthly' && chartRange !== 'all') {
      return sortedData.slice(-chartRange as number);
    }
    return sortedData;
  }, [records, invoices, assets, filter, displayMode, viewMode, selectedAssetId, categories, chartRange, customStartDate, customEndDate]);

  // --- TOOLTIP DIZÁJN ---
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
            {totalExp > 0 && (
              <div className="tooltip-row font-rose">
                <span>Össz. Kiadás:</span><span>-{totalExp.toLocaleString()} {unit}</span>
              </div>
            )}
            {totalInc > 0 && (
              <div className="tooltip-row font-emerald">
                <span>Össz. Bevétel:</span><span>+{totalInc.toLocaleString()} {unit}</span>
              </div>
            )}
            <div className="tooltip-net" style={{ color: netTotal > 0 ? '#10b981' : (netTotal < 0 ? '#f87171' : '#f8fafc') }}>
              <span>Egyenleg:</span>
              <span>{netTotal > 0 ? '+' : ''}{netTotal.toLocaleString()} {unit}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // --- MENTÉSEK ÉS APIS MŰVELETEK ---
  const handleAssetSave = async () => {
    if (!newAsset.friendlyName) return alert("Adj nevet az eszköznek / személynek!");
    const method = editingAssetId ? 'PUT' : 'POST';
    const url = editingAssetId ? `${BACKEND_URL}/api/assets/${editingAssetId}` : `${BACKEND_URL}/api/assets`;
    try {
      const res = await fetch(url, {
        method, 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify(newAsset)
      });
      if (res.ok) {
        setEditingAssetId(null);
        setNewAsset({ category: 'property', friendlyName: '', city: '', street: '', houseNumber: '', plateNumber: '', fuelType: 'Benzin', area: '' });
        setShowAssetManager(false);
        fetchAll(user.token);
      } else { alert("Hiba történt."); }
    } catch (error) { alert("Hálózati hiba!"); }
  };

  const handleCategorySave = async () => {
    if (!newCategory.name) return;
    const url = editingCategoryId ? `${BACKEND_URL}/api/categories/${editingCategoryId}` : `${BACKEND_URL}/api/categories`;
    const res = await fetch(url, {
      method: editingCategoryId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(newCategory)
    });
    if (res.ok) {
      setEditingCategoryId(null);
      setNewCategory({ name: '', icon: '📄', type: 'both', isPublic: false });
      fetchAll(user.token);
    } else {
      const data = await res.json();
      alert(data.error || "Hiba történt");
    }
  };

  const handleCategoryDelete = async (id: number) => {
    if (!window.confirm("Biztosan törlöd a kategóriát?")) return;
    const res = await fetch(`${BACKEND_URL}/api/categories/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` }
    });
    if (res.ok) fetchAll(user.token);
    else {
      const data = await res.json();
      alert(data.error || "Hiba történt");
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelRecordEdit = () => {
    setEditingRecordId(null);
    setEditingRecordLType(null);
    setValue('');
  };

  const handleSave = async () => {
    if (!targetAssetId || targetAssetId === 'all') return alert("Kérlek, válassz ki egy konkrét eszközt!");
    if (!value) return alert("Kérlek, add meg az értéket!");
    
    const currentCat = categories.find(c => c.Name === type);
    const isInvoiceType = currentCat?.Type === 'invoice_only' || currentCat?.Type === 'income';
    const body = { 
      type, 
      value: parseFloat(value), 
      amount: parseFloat(value), 
      date: (recordMode === 'invoice' || isInvoiceType) ? invoiceDate : meterDate, 
      assetId: parseInt(targetAssetId) 
    };
    const isEditing = editingRecordId !== null;
    const endpoint = isEditing 
        ? `/api/${editingRecordLType === 'meter' ? 'records' : 'invoices'}/${editingRecordId}`
        : ((recordMode === 'invoice' || isInvoiceType) ? '/api/invoices' : '/api/records');
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(body)
    });
    if (res.ok) { 
      setValue(''); 
      setEditingRecordId(null);
      setEditingRecordLType(null);
      fetchAll(user.token, viewingUserId!);
    } else { alert("Hiba történt a mentés során."); }
  };

  const handleShare = async () => {
    if (!shareEmail) return alert("Kérlek adj meg egy email címet!");
    const res = await fetch(`${BACKEND_URL}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({ sharedWithEmail: shareEmail })
    });
    if (res.ok) { alert("Sikeres megosztás!"); setShareEmail(''); fetchMyShares(user.token); } 
    else { alert("Hiba történt a megosztás során."); }
  };

  const revokeShare = async (id: number) => {
    if (!window.confirm("Biztosan visszavonod a hozzáférést?")) return;
    const res = await fetch(`${BACKEND_URL}/api/shares/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` }
    });
    if (res.ok) fetchMyShares(user.token);
  };

  const getIcon = (t: string) => {
    if (t === 'Összes') return '📊';
    if (t === 'Összes kiadás') return '📉';
    const cat = categories.find(c => c.Name === t);
    return cat ? cat.Icon : '📄';
  };

  const getColor = (t: string = filter) => {
    if (displayMode === 'cost' && t !== 'Összes' && t !== 'Összes kiadás') return '#10b981';
    if (t === 'Összes') return '#6366f1';
    if (t === 'Összes kiadás') return '#f43f5e';
    switch(t) {
      case 'Áram': return '#fbbf24';
      case 'Víz': return '#38bdf8';
      case 'Gáz': return '#f87171';
      case 'Üzemanyag': return '#a855f7';
      case 'Internet': return '#ec4899';
      case 'Szemétszállítás': return '#94a3b8';
      case 'Albérlet': return '#f472b6';
      default: 
        let hash = 0;
        for (let i = 0; i < t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${hash % 360}, 70%, 60%)`;
    }
  };

  const combinedList = [
    ...(filter === 'Összes' || filter === 'Összes kiadás' ? [] : records.filter(r => (selectedAssetId === 'all' || String(r.AssetId) === String(selectedAssetId)) && r.Type === filter).map(r => ({ ...r, lType: 'meter', d: r.FormattedDate }))),
    ...invoices.filter(i => {
      const isAssetMatch = selectedAssetId === 'all' || String(i.AssetId) === String(selectedAssetId);
      if (!isAssetMatch) return false;
      if (filter === 'Összes') return true;
      if (filter === 'Összes kiadás') return categories.find(c => c.Name === i.Type)?.Type !== 'income';
      return i.Type === filter;
    }).map(i => ({ ...i, lType: 'invoice', Value: i.Amount, d: i.Month }))
  ].sort((a, b) => new Date(b.d).getTime() - new Date(a.d).getTime());

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="app-container">
        
        {/* --- HEADER --- */}
        <header className="app-header">
          <div className="header-top-row">
            <div className="brand-logo">
              <span className="logo-icon">⚡</span>
              <h1>Rezsiapp <span className="version-tag">2.0</span></h1>
            </div>
            {user && (
              <div className="user-profile-zone">
                <div className="user-meta" title={user.email}>
                  <img src={user.picture} alt="Avatar" className="user-avatar" />
                </div>
                <button className="btn-logout-icon" onClick={forceLogout} title="Kilépés">🚪</button>
              </div>
            )}
          </div>
          
          {user && !isReadOnly && (
            <div className="header-actions-row">
              <button className="nav-btn" onClick={() => { setShowCategoryManager(true); setShowAssetManager(false); }}>⚙️ Kategóriák</button>
              <button className="nav-btn nav-btn-primary" onClick={() => { setShowAssetManager(true); setShowCategoryManager(false); }}>🏠 Eszközök</button>
            </div>
          )}
        </header>

        {/* --- MODAL: KATEGÓRIÁK --- */}
        {showCategoryManager && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Kategóriák karbantartása</h3>
                <button className="close-modal" onClick={() => setShowCategoryManager(false)}>×</button>
              </div>
              <div className="modal-form">
                <input placeholder="Ikon (pl. ⚡)" value={newCategory.icon} onChange={(e) => setNewCategory({...newCategory, icon: e.target.value})} style={{width: '70px'}}/>
                <input placeholder="Kategória neve" value={newCategory.name} onChange={(e) => setNewCategory({...newCategory, name: e.target.value})} />
                <select value={newCategory.type} onChange={(e) => setNewCategory({...newCategory, type: e.target.value})}>
                  <option value="both">📟 Óraállás + 💰 Számla (Kiadás)</option>
                  <option value="invoice_only">Csak 💰 Számla (Kiadás)</option>
                  <option value="income">💵 Bevétel (Csak Számla)</option>
                </select>
                {isAdmin && (
                  <label className="checkbox-label">
                    <input type="checkbox" checked={newCategory.isPublic} onChange={(e) => setNewCategory({...newCategory, isPublic: e.target.checked})} />
                    Publikus (Mindenki látja)
                  </label>
                )}
                <button className="btn-save-action" onClick={handleCategorySave}>Mentés</button>
              </div>
              <div className="modal-list">
                {categories.map((c: any) => (
                  <div key={c.Id} className="list-item-row">
                    <span>{c.Icon} {c.Name} {!c.UserId ? '🌐' : '🔒'}</span>
                    {(!c.UserId || isAdmin) && (
                      <div className="actions">
                        <button className="action-inline-btn" onClick={() => { setEditingCategoryId(c.Id); setNewCategory({ name: c.Name, icon: c.Icon, type: c.Type, isPublic: !c.UserId }); }}>✏️</button>
                        <button className="action-inline-btn delete" onClick={() => handleCategoryDelete(c.Id)}>❌</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- MODAL: ESZKÖZÖK --- */}
        {showAssetManager && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h3>{editingAssetId ? "Módosítás" : "Új eszköz / Személy"}</h3>
                <button className="close-modal" onClick={() => setShowAssetManager(false)}>×</button>
              </div>
              <div className="modal-form">
                <select value={newAsset.category} onChange={(e) => setNewAsset({...newAsset, category: e.target.value})}>
                  <option value="property">🏠 Ingatlan</option>
                  <option value="car">🚗 Jármű</option>
                  <option value="person">👤 Személy</option>
                </select>
                <input placeholder="Megnevezés" value={newAsset.friendlyName} onChange={(e) => setNewAsset({...newAsset, friendlyName: e.target.value})} />
                {newAsset.category === 'property' && (
                  <>
                    <input placeholder="Város" value={newAsset.city} onChange={(e) => setNewAsset({...newAsset, city: e.target.value})} />
                    <input placeholder="Utca, házszám" value={newAsset.street} onChange={(e) => setNewAsset({...newAsset, street: e.target.value})} />
                    <input placeholder="m²" type="number" value={newAsset.area} onChange={(e) => setNewAsset({...newAsset, area: e.target.value})} />
                  </>
                )}
                {newAsset.category === 'car' && (
                  <input placeholder="Rendszám" value={newAsset.plateNumber} onChange={(e) => setNewAsset({...newAsset, plateNumber: e.target.value})} />
                )}
                <button className="btn-save-action" onClick={handleAssetSave}>Mentés</button>
              </div>
              <div className="modal-list">
                {assets.map((a: any) => (
                  <div key={a.Id} className="list-item-row">
                    <span>{a.Category === 'car' ? '🚗' : a.Category === 'person' ? '👤' : '🏠'} {a.FriendlyName}</span>
                    <button className="action-inline-btn" onClick={() => { setEditingAssetId(a.Id); setNewAsset({ category: a.Category || 'property', friendlyName: a.FriendlyName || '', city: a.City || '', street: a.Street || '', houseNumber: a.HouseNumber || '', plateNumber: a.PlateNumber || '', fuelType: a.FuelType || 'Benzin', area: a.Area || '' }); }}>✏️</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- FŐ TARTALOM --- */}
        {user ? (
          <div className="dashboard-grid">
            
            {/* SIDESBAR VEZÉRLŐK */}
            <aside className="dashboard-sidebar">
              <div className="dashboard-card compact-card">
                <div className="form-group">
                  <label>Eszköz kiválasztása</label>
                  <select className="styled-select" value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
                    <option value="all">🌐 Összesített nézet</option>
                    {assets.map((a: any) => (
                      <option key={a.Id} value={a.Id}>
                        {a.Category === 'car' ? '🚗' : a.Category === 'person' ? '👤' : '🏠'} {a.FriendlyName}
                      </option>
                    ))}
                  </select>
                </div>

                {sharedUsers.length > 0 && (
                  <div className="form-group mt-3">
                    <label>Fiókváltás</label>
                    <select className="styled-select selector-highlight" value={viewingUserId || user?.sub} onChange={(e) => { setViewingUserId(e.target.value); setSelectedAssetId('all'); fetchAll(user.token, e.target.value); }}>
                      <option value={user?.sub}>Saját adataim</option>
                      {sharedUsers.map(su => (
                        <option key={su.owner_id} value={su.owner_id}>{su.owner_email}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Új adat rögzítése */}
              {!isReadOnly && (
                <div className="dashboard-card">
                  <h3 className="card-title">Új Tranzakció / Érték</h3>
                  {editingRecordId && <div className="edit-indicator">✏️ Módosítás folyamatban...</div>}
                  
                  <div className="tab-switcher">
                    <button className={`tab-btn ${recordMode === 'meter' ? 'active' : ''}`} onClick={() => setRecordMode('meter')} disabled={editingRecordId !== null || assets.find(a => String(a.Id) === String(targetAssetId))?.Category === 'car' || categories.find(c => c.Name === type)?.Type === 'invoice_only' || categories.find(c => c.Name === type)?.Type === 'income'}>📟 Óraállás</button>
                    <button className={`tab-btn ${recordMode === 'invoice' ? 'active' : ''}`} onClick={() => setRecordMode('invoice')} disabled={editingRecordId !== null}>💰 Számla</button>
                  </div>

                  <div className="vertical-form">
                    <select value={targetAssetId} onChange={(e) => setTargetAssetId(e.target.value)}>
                      <option value="">Válassz eszközt...</option>
                      {assets.map((a: any) => (<option key={a.Id} value={a.Id}>{a.FriendlyName}</option>))}
                    </select>
                    
                    <select value={type} onChange={(e) => setType(e.target.value)}>
                      {getAllowedTypes(targetAssetId).map(t => <option key={t} value={t}>{getIcon(t)} {t}</option>)}
                    </select>
                    
                    <input type="date" value={recordMode === 'meter' ? meterDate : invoiceDate} onChange={(e) => recordMode === 'meter' ? setMeterDate(e.target.value) : setInvoiceDate(e.target.value)} />
                    <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Érték (egység / Ft)" />
                    
                    <div className="action-buttons-row">
                      <button className="btn-submit-form" onClick={handleSave} disabled={!targetAssetId || targetAssetId === 'all' || !value}>
                        {editingRecordId ? 'Módosítás mentése' : 'Adat rögzítése'}
                      </button>
                      {editingRecordId && <button className="btn-cancel-flat" onClick={cancelRecordEdit}>Mégse</button>}
                    </div>
                  </div>
                </div>
              )}

              {/* Családi megosztás */}
              {!isReadOnly && (
                <div className="dashboard-card compact-card">
                  <h4 className="sub-title">Hozzáférés megosztása</h4>
                  <div className="flex-input-group">
                    <input type="email" placeholder="partner@email.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
                    <button className="btn-add-plus" onClick={handleShare}>+</button>
                  </div>
                  {myShares.length > 0 && (
                    <div className="shares-mini-list">
                      {myShares.map(s => (
                        <div key={s.id} className="share-mini-item">
                          <span>{s.shared_with_email}</span>
                          <button onClick={() => revokeShare(s.id)}>törlés</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>

            {/* MAIN TARTALOM (Grafikon & Listák) */}
            <main className="dashboard-main">
              
              {/* Eszköztár szűrőkkel */}
              <div className="toolbar-card">
                <div className="category-scroll-chips">
                  {categories.map(c => (
                    <button key={c.Id} className={`chip-btn ${filter === c.Name ? 'active' : ''}`} onClick={() => setFilter(c.Name)} style={filter === c.Name ? {backgroundColor: getColor(c.Name), borderColor: getColor(c.Name)} : {}}>{c.Icon} {c.Name}</button>
                  ))}
                  {displayMode === 'cost' && (
                    <>
                      <button className={`chip-btn ${filter === 'Összes kiadás' ? 'active' : ''}`} onClick={() => setFilter('Összes kiadás')} style={{backgroundColor: filter === 'Összes kiadás' ? getColor('Összes kiadás') : ''}}>{getIcon('Összes kiadás')} Összes kiadás</button>
                      <button className={`chip-btn ${filter === 'Összes' ? 'active' : ''}`} onClick={() => setFilter('Összes')} style={{backgroundColor: filter === 'Összes' ? getColor('Összes') : ''}}>{getIcon('Összes')} Összesen</button>
                    </>
                  )}
                </div>

                <div className="display-toggles">
                  <div className="toggle-group-row">
                    <div className="toggle-group">
                      <button className={displayMode === 'usage' ? 'active' : ''} disabled={categories.find(c => c.Name === filter)?.Type === 'invoice_only' || categories.find(c => c.Name === filter)?.Type === 'income' || filter === 'Összes' || filter === 'Összes kiadás'} onClick={() => setDisplayMode('usage')}>Fogyasztás</button>
                      <button className={displayMode === 'cost' ? 'active' : ''} onClick={() => setDisplayMode('cost')}>Költség</button>
                    </div>

                    <div className="toggle-group">
                      <button className={viewMode === 'monthly' ? 'active' : ''} onClick={() => setViewMode('monthly')}>Havi</button>
                      <button className={viewMode === 'annual' ? 'active' : ''} onClick={() => setViewMode('annual')}>Éves</button>
                    </div>
                  </div>

                  <div className="toggle-group-row width-100">
                    <select className="styled-range-select" value={chartRange} onChange={(e) => { const val = e.target.value; setChartRange(val === 'all' || val === 'custom' ? val : parseInt(val)); }}>
                      {viewMode === 'monthly' && <option value={6}>Utolsó 6 hónap</option>}
                      {viewMode === 'monthly' && <option value={12}>Utolsó 12 hónap</option>}
                      {viewMode === 'monthly' && <option value={24}>Utolsó 24 hónap</option>}
                      <option value="all">Minden adat</option>
                      <option value="custom">Egyedi...</option>
                    </select>

                    {chartRange === 'custom' && (
                      <div className="custom-range-inputs">
                        <input type="month" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
                        <span>-</span>
                        <input type="month" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* GRAFIKON KÁRTYA */}
              <div className="dashboard-card chart-container-card">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" tickLine={false} />
                      <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
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
                ) : (
                  <div className="empty-state-notice">Nincs adat a választott időszakban.</div>
                )}
              </div>

              {/* LISTA SZEKCIÓ */}
              <div className="list-history-wrapper">
                <h3 className="section-title-flat">Tranzakciós előzmények ({combinedList.length})</h3>
                <div className="records-feed">
                  {combinedList.map((item: any, idx) => {
                    const asset = assets.find(a => String(a.Id) === String(item.AssetId));
                    const cat = categories.find(c => c.Name === item.Type);
                    const isIncome = cat?.Type === 'income';

                    return (
                      <div key={idx} className="feed-item-card">
                        <div className="feed-left">
                          <div className={`icon-indicator ${item.lType}`}>{item.lType === 'meter' ? '📟' : '💰'}</div>
                          <div className="feed-meta-details">
                            <span className="feed-title">{getIcon(item.Type)} {item.Type}</span>
                            <span className="feed-sub">{asset ? `${asset.FriendlyName}` : 'Ismeretlen'} • {String(item.d).substring(0, 10)}</span>
                          </div>
                        </div>
                        <div className="feed-right">
                          <span className={`feed-value-tag ${isIncome ? 'income-green' : ''}`}>
                            {isIncome ? '+' : ''}{(parseFloat(item.Value) || 0).toLocaleString()} {item.lType === 'meter' ? 'egység' : 'Ft'}
                          </span>
                          {!isReadOnly && (
                            <div className="feed-actions-hover">
                              <button className="btn-circle-edit" onClick={() => handleEditRecord(item)}>✏️</button>
                              <button className="btn-circle-delete" onClick={async () => { if(window.confirm("Biztosan törlöd?")) { await fetch(`${BACKEND_URL}/api/${item.lType === 'meter' ? 'records' : 'invoices'}/${item.Id || item.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` } }); fetchAll(user.token); } }}>❌</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </main>
          </div>
        ) : (
          
          /* --- LOGIN FELÜLET --- */
          <div className="auth-wrapper-centered">
            <div className="auth-hero-card">
              <h1 className="auth-title">Üdvözöl a <span className="gradient-text">Rezsiapp 2.0</span></h1>
              <p className="auth-subtitle">A háztartási rezsiköltségek és járműkiadások okos, letisztult kezelőfelülete.</p>
              
              <div className="auth-features-list">
                <div className="feature-row">
                  <div className="f-icon">📊</div>
                  <div>
                    <h4>Vizuális Statisztikák</h4>
                    <p>Egyszerűen átlátható grafikonok havi és éves bontásokban.</p>
                  </div>
                </div>
                <div className="feature-row">
                  <div className="f-icon">🚗</div>
                  <div>
                    <h4>Több különálló eszköz</h4>
                    <p>Kezeld külön lakásod mérőóráit és az autók üzemanyag-költségeit.</p>
                  </div>
                </div>
              </div>

              <div className="auth-action-box">
                <p>Belépéshez használd a meglévő biztonságos Google fiókodat.</p>
                <div className="google-signin-btn-container">
                  <GoogleLogin onSuccess={(res) => handleLoginSuccess(res.credential!)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PRÉMIUM MOBIL-FIRST STYLING MOTOR --- */}
        <style>{`
          :root {
            --bg-main: #0f172a;
            --bg-card: #1e293b;
            --bg-hover: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #6366f1;
            --accent-hover: #4f46e5;
            --emerald: #10b981;
            --rose: #f43f5e;
            --amber: #fbbf24;
          }

          body {
            background-color: var(--bg-main);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0; padding: 0;
            font-size: 16px;
            -webkit-font-smoothing: antialiased;
          }

          .app-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 12px;
            box-sizing: border-box;
          }

          /* --- FEJLÉC (RESPONZÍV) --- */
          .app-header {
            background: var(--bg-card);
            border-radius: 14px;
            padding: 14px 16px;
            margin-bottom: 16px;
            border: 1px solid #2e3a4e;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .header-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .brand-logo h1 {
            font-size: 1.25rem; margin: 0; font-weight: 700;
          }

          .header-actions-row {
            display: flex;
            gap: 8px;
          }

          .header-actions-row .nav-btn {
            flex: 1;
            text-align: center;
            padding: 10px;
            font-size: 0.9rem;
          }

          .nav-btn {
            background: #27354a;
            border: 1px solid #3d4f68;
            color: var(--text-main);
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
          }

          .nav-btn-primary {
            background: var(--accent);
            border-color: var(--accent);
          }

          .user-profile-zone {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .user-avatar {
            width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--accent);
          }

          .btn-logout-icon {
            background: transparent; border: none; cursor: pointer; font-size: 1.3rem; padding: 4px;
          }

          /* --- RÁCS ELRENDEZÉS --- */
          .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }

          @media (min-width: 992px) {
            .dashboard-grid {
              grid-template-columns: 340px 1fr;
              gap: 24px;
            }
          }

          /* --- KÁRTYÁK --- */
          .dashboard-card {
            background: var(--bg-card);
            border-radius: 14px;
            padding: 16px;
            border: 1px solid #2e3a4e;
          }

          .card-title {
            margin-top: 0; margin-bottom: 14px; font-size: 1.05rem; font-weight: 600;
          }

          .sub-title {
            margin-top: 0; margin-bottom: 8px; font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase;
          }

          /* --- IOS-BIZTOS BEVITELI MEZŐK ÉS FORMOK --- */
          .form-group {
            display: flex; flex-direction: column; gap: 6px;
          }

          .form-group label {
            font-size: 0.8rem; color: var(--text-muted); font-weight: 500;
          }

          /* Nagyon fontos: minimum 16px font-size, hogy a mobil Safari ne kicsinyítse le az oldalt! */
          .styled-select, .vertical-form select, .vertical-form input, .flex-input-group input {
            width: 100%;
            padding: 12px;
            background: var(--bg-main);
            border: 1px solid #334155;
            border-radius: 10px;
            color: var(--text-main);
            font-size: 16px !important;
            box-sizing: border-box;
            outline: none;
            height: 48px; /* Tökéletes touch magasság */
          }

          .vertical-form {
            display: flex; flex-direction: column; gap: 12px; margin-top: 14px;
          }

          .tab-switcher {
            display: flex; background: var(--bg-main); padding: 4px; border-radius: 10px; gap: 4px;
          }

          .tab-btn {
            flex: 1; background: transparent; border: none; color: var(--text-muted);
            padding: 10px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;
            height: 40px;
          }

          .tab-btn.active {
            background: var(--bg-card); color: var(--text-main); box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          }

          .btn-submit-form {
            background: var(--emerald); color: white; border: none; padding: 12px;
            border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 1rem; height: 48px;
          }

          .btn-submit-form:disabled { opacity: 0.35; }

          .flex-input-group {
            display: flex; gap: 8px;
          }
          .btn-add-plus {
            background: var(--accent); border: none; color: white; width: 48px; height: 48px;
            border-radius: 10px; font-size: 1.2rem; cursor: pointer; font-weight: bold;
          }

          /* --- HORIZONTÁLIS SWIPE-OLHATÓ SZŰRŐ CHIPEK --- */
          .toolbar-card {
            background: var(--bg-card); border-radius: 14px; padding: 14px;
            border: 1px solid #2e3a4e; display: flex; flex-direction: column; gap: 14px;
          }

          .category-scroll-chips {
            display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;
            -webkit-overflow-scrolling: touch;
          }
          /* Rejtsük el az asztali görgetősávot de maradjon görgethető */
          .category-scroll-chips::-webkit-scrollbar { display: none; }

          .chip-btn {
            background: var(--bg-main); border: 1px solid #334155; color: var(--text-main);
            padding: 10px 16px; border-radius: 24px; white-space: nowrap; cursor: pointer;
            font-size: 0.85rem; font-weight: 500; height: 40px; display: inline-flex; align-items: center;
          }

          .chip-btn.active { border-color: transparent; color: white; font-weight: 600; }

          /* --- VEZÉRLŐ GOMB CSOPORTOK --- */
          .display-toggles {
            display: flex; flex-direction: column; gap: 10px;
          }

          .toggle-group-row {
            display: flex; gap: 8px; width: 100%;
          }

          .toggle-group {
            flex: 1; display: flex; background: var(--bg-main); padding: 4px; border-radius: 24px; border: 1px solid #334155;
          }

          .toggle-group button {
            flex: 1; background: transparent; border: none; color: var(--text-muted);
            padding: 8px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; cursor: pointer;
            height: 34px;
          }

          .toggle-group button.active { background: var(--accent); color: white; }

          .styled-range-select {
            width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid #334155;
            padding: 10px; border-radius: 24px; font-size: 0.85rem; outline: none; height: 42px; text-align: center;
          }

          /* --- TRANZAKCIÓS LISTA --- */
          .list-history-wrapper { margin-top: 8px; }
          .section-title-flat { font-size: 1.05rem; margin-bottom: 12px; font-weight: 600; color: var(--text-muted); }

          .records-feed { display: flex; flex-direction: column; gap: 8px; }

          .feed-item-card {
            background: var(--bg-card); border: 1px solid #2e3a4e; border-radius: 12px;
            padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;
          }

          .feed-left { display: flex; align-items: center; gap: 10px; }
          
          .icon-indicator {
            width: 36px; height: 36px; border-radius: 10px; background: var(--bg-main);
            display: flex; align-items: center; justify-content: center; font-size: 1rem;
          }

          .feed-meta-details { display: flex; flex-direction: column; }
          .feed-title { font-weight: 600; font-size: 0.95rem; }
          .feed-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 1px; }

          .feed-right { display: flex; align-items: center; gap: 10px; }
          .feed-value-tag { font-weight: 700; font-size: 0.95rem; }
          .income-green { color: var(--emerald); }

          /* Elrejtett natív hover gombok helyett mobilon mindig elérhető pici gombok */
          .feed-actions-hover { display: flex; gap: 4px; }
          .btn-circle-edit, .btn-circle-delete {
            background: var(--bg-main); border: 1px solid #334155; border-radius: 8px;
            width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 0.85rem;
          }

          /* --- RECHARTS MODERNEBB TOOLTIP --- */
          .custom-tooltip-box {
            background: #1e293b; padding: 12px; border: 1px solid #334155; border-radius: 8px;
            color: #f8fafc; box-shadow: 0 10px 25px rgba(0,0,0,0.5); font-size: 13px;
          }
          .tooltip-title { margin: 0 0 6px 0; font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 4px; }
          .tooltip-row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 3px; }

          /* --- MODÁLIS ABLAKOK --- */
          .modal-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(5px);
            display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 10px;
          }

          .modal-content {
            background: var(--bg-card); border: 1px solid #334155; border-radius: 16px;
            padding: 20px; width: 100%; max-width: 460px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            max-height: 90vh; overflow-y: auto;
          }

          .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
          .close-modal { background: transparent; border: none; color: var(--text-muted); font-size: 1.6rem; cursor: pointer; }

          .modal-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
          .btn-save-action { background: var(--accent); color: white; border: none; padding: 12px; border-radius: 10px; font-weight: 600; font-size: 16px; cursor: pointer; }

          .list-item-row {
            display: flex; justify-content: space-between; align-items: center;
            background: var(--bg-main); padding: 10px 12px; border-radius: 10px; margin-bottom: 6px; font-size: 0.95rem;
          }

          /* --- BEJELENTKEZŐ PANELEK --- */
          .auth-wrapper-centered { display: flex; justify-content: center; align-items: center; min-height: 70vh; }
          .auth-hero-card { background: var(--bg-card); border: 1px solid #2e3a4e; max-width: 480px; padding: 24px; border-radius: 20px; text-align: center; }
          .gradient-text { background: linear-gradient(135deg, #818cf8, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .auth-title { font-size: 1.6rem; margin-bottom: 8px; }
          .auth-subtitle { color: var(--text-muted); font-size: 0.9rem; line-height: 1.4; }
          .auth-features-list { text-align: left; margin: 20px 0; display: flex; flex-direction: column; gap: 12px; }
          .feature-row { display: flex; gap: 12px; align-items: center; }
          .f-icon { font-size: 1.2rem; background: var(--bg-main); padding: 6px; border-radius: 8px; }
          .feature-row h4 { margin: 0; font-size: 0.9rem; }
          .feature-row p { margin: 0; font-size: 0.8rem; color: var(--text-muted); }
          .auth-action-box { background: var(--bg-main); padding: 16px; border-radius: 12px; border: 1px solid #334155; }
          .google-signin-btn-container { display: flex; justify-content: center; margin-top: 10px; }
        `}</style>
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;
