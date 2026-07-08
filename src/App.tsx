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

  // Az eszköz-kategória hozzárendeléseket tároló állapot
  const [assetCategoryMap, setAssetCategoryMap] = useState<{ [key: string]: string[] }>({});

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);
  const isReadOnly = viewingUserId !== null && viewingUserId !== user?.sub;

  // --- API MŰVELETEK ---
  const handleToggleCategoryForAsset = async (assetId: string, categoryName: string) => {
    if (isReadOnly) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/asset-categories/toggle`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ assetId: parseInt(assetId), categoryName })
      });
      if (res.ok) {
        const currentAllowed = assetCategoryMap[assetId] || [];
        let updated: string[];
        if (currentAllowed.includes(categoryName)) {
          updated = currentAllowed.filter(c => c !== categoryName);
        } else {
          updated = [...currentAllowed, categoryName];
        }
        setAssetCategoryMap({ ...assetCategoryMap, [assetId]: updated });
      } else {
        alert("Nem sikerült menteni a beállítást az adatbázisba.");
      }
    } catch (e) {
      console.error(e);
      alert("Hálózati hiba a mentés során.");
    }
  };

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
      
      const loadedCategories = Array.isArray(catData) ? catData : [];
      setCategories(loadedCategories);
      if (loadedCategories.length > 0 && !type) {
        setType(loadedCategories[0].Name);
      }

      // Adatbázis mátrix eredmény feldolgozása a felület számára
      if (Array.isArray(acData)) {
        const map: { [key: string]: string[] } = {};
        acData.forEach((row: any) => {
          const aId = String(row.asset_id);
          if (!map[aId]) map[aId] = [];
          map[aId].push(row.category_name);
        });
        setAssetCategoryMap(map);
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
    
    // Ha az adatbázisból jött egyedi mátrix beállítás az eszközhöz, azt használjuk
    if (assetCategoryMap[assetId] && assetCategoryMap[assetId].length > 0) {
      return assetCategoryMap[assetId];
    }

    // Automatikus intelligens fallback, ha még üres az adatbázis mátrix
    const asset = assets.find((a: any) => String(a.Id) === String(assetId));
    if (asset?.Category === 'car') {
      return allCatNames.includes('Üzemanyag') ? ['Üzemanyag'] : allCatNames;
    }
    if (asset?.Category === 'person') {
      return allCatNames.filter(name => ['Fizetés', 'Túrájós', 'Fotózás', 'Egyéb'].includes(name));
    }
    if (asset?.Category === 'property') {
      return allCatNames.filter(name => !['Üzemanyag', 'Fizetés'].includes(name));
    }
    return allCatNames;
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
  }, [targetAssetId, type, assets, categories, assetCategoryMap]);

  // --- GRAFIKON ADATOK ---
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
            <div className="tooltip-net" style={{ color: netTotal > 0 ? '#10b981' : (netTotal < 0 ? '#ef4444' : '#0f172a') }}>
              <span>Egyenleg:</span>
              <span>{netTotal > 0 ? '+' : ''}{netTotal.toLocaleString()} {unit}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleAssetSave = async () => {
    if (!newAsset.friendlyName) return alert("Adj nevet az eszköznek!");
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
    if (t === 'Összes') return '#4f46e5';
    if (t === 'Összes kiadás') return '#ef4444';
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
                <input placeholder="Ikon" value={newCategory.icon} onChange={(e) => setNewCategory({...newCategory, icon: e.target.value})} style={{width: '70px'}}/>
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

        {/* --- MODAL: ESZKÖZÖK + ADATBÁZIS MÁTRIX NÉZET --- */}
        {showAssetManager && (
          <div className="modal-backdrop">
            <div className="modal-content text-left">
              <div className="modal-header">
                <h3>{editingAssetId ? "Módosítás" : "Eszközök & Tartozó típusok"}</h3>
                <button className="close-modal" onClick={() => setShowAssetManager(false)}>×</button>
              </div>
              
              <div className="modal-form">
                <select value={newAsset.category} onChange={(e) => setNewAsset({...newAsset, category: e.target.value})}>
                  <option value="property">🏠 Ingatlan</option>
                  <option value="car">🚗 Jármű</option>
                  <option value="person">👤 Személy</option>
                </select>
                <input placeholder="Megnevezés" value={newAsset.friendlyName} onChange={(e) => setNewAsset({...newAsset, friendlyName: e.target.value})} />
                <button className="btn-save-action" onClick={handleAssetSave}>Új eszköz mentése</button>
              </div>

              <div className="matrix-title">Eszközök egyedi kategória rendelései (Adatbázis szűrő):</div>
              <div className="modal-list scrollable-list">
                {assets.map((a: any) => (
                  <div key={a.Id} className="asset-matrix-card">
                    <div className="asset-matrix-header">
                      <strong>{a.Category === 'car' ? '🚗' : a.Category === 'person' ? '👤' : '🏠'} {a.FriendlyName}</strong>
                      <span className="type-badge">{a.Category}</span>
                    </div>
                    
                    <div className="matrix-checkbox-grid">
                      {categories.map((c: any) => {
                        const isAllowed = (assetCategoryMap[a.Id] || []).includes(c.Name);
                        return (
                          <label key={c.Id} className={`matrix-checkbox-item ${isAllowed ? 'checked' : ''}`}>
                            <input 
                              type="checkbox" 
                              checked={isAllowed} 
                              onChange={() => handleToggleCategoryForAsset(String(a.Id), c.Name)} 
                            />
                            <span>{c.Icon} {c.Name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- FŐ TARTALOM --- */}
        {user ? (
          <div className="dashboard-grid">
            
            <aside className="dashboard-sidebar">
              <div className="dashboard-card compact-card">
                <div className="form-group">
                  <label>Eszköz / Entitás kiválasztása</label>
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

            <main className="dashboard-main">
              
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

              <div className="dashboard-card chart-container-card">
                {chartData.length > 0 ? (
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
                ) : (
                  <div className="empty-state-notice">Nincs adat a választott időszakban.</div>
                )}
              </div>

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
                            <span className="feed-sub"> {asset ? `${asset.FriendlyName}` : 'Ismeretlen'} • {String(item.d).substring(0, 10)}</span>
                          </div>
                        </div>
                        <div className="feed-right">
                          <span className={`feed-value-tag ${isIncome ? 'income-green' : 'expense-dark'}`}>
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
          <div className="auth-wrapper-centered">
            <div className="auth-hero-card">
              <h1 className="auth-title">Üdvözöl a <span className="gradient-text">Rezsiapp 2.0</span></h1>
              <p className="auth-subtitle">Háztartási költségeid és mérőóráid letisztult, világos kezelőfelülete.</p>
              <div className="auth-action-box">
                <p>A belépéshez használd a meglévő Google fiókodat.</p>
                <div className="google-signin-btn-container">
                  <GoogleLogin onSuccess={(res) => handleLoginSuccess(res.credential!)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- APPS LIGHT-THEME ENGINE & RESPONSIVE FIXES --- */}
        <style>{`
          :root {
            --bg-main: #f8fafc;
            --bg-card: #ffffff;
            --bg-hover: #f1f5f9;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --accent: #4f46e5;
            --accent-hover: #4338ca;
            --border-color: #e2e8f0;
            --emerald: #10b981;
            --rose: #ef4444;
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
            max-width: 1280px;
            margin: 0 auto;
            padding: 16px;
            box-sizing: border-box;
            width: 100%;
          }

          .app-header {
            background: var(--bg-card);
            border-radius: 16px;
            padding: 16px 20px;
            margin-bottom: 20px;
            border: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }

          .header-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .brand-logo h1 {
            font-size: 1.3rem; margin: 0; font-weight: 700; color: var(--text-main);
          }

          .version-tag { color: var(--accent); font-size: 0.85rem; }
          .header-actions-row { display: flex; gap: 8px; }
          .header-actions-row .nav-btn { flex: 1; text-align: center; padding: 10px; font-size: 0.9rem; }

          .nav-btn {
            background: #f1f5f9; border: 1px solid var(--border-color); color: var(--text-main);
            border-radius: 10px; cursor: pointer; font-weight: 600; transition: all 0.2s;
          }
          .nav-btn:hover { background: #e2e8f0; }
          .nav-btn-primary { background: var(--accent); border-color: var(--accent); color: white; }
          .nav-btn-primary:hover { background: var(--accent-hover); }

          .user-profile-zone { display: flex; align-items: center; gap: 12px; }
          .user-avatar { width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--accent); }
          .btn-logout-icon { background: transparent; border: none; cursor: pointer; font-size: 1.3rem; }

          .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
            width: 100%;
          }

          @media (min-width: 992px) {
            .dashboard-grid {
              grid-template-columns: 320px 1fr;
            }
          }

          .dashboard-main {
            min-width: 0;
            width: 100%;
          }

          .dashboard-card {
            background: var(--bg-card);
            border-radius: 16px;
            padding: 20px;
            border: 1px solid var(--border-color);
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          }

          .compact-card { padding: 16px; }
          .card-title { margin-top: 0; margin-bottom: 14px; font-size: 1.1rem; font-weight: 600; }
          .sub-title { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; }

          .form-group { display: flex; flex-direction: column; gap: 6px; }
          .form-group label { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }

          .styled-select, .vertical-form select, .vertical-form input, .flex-input-group input {
            width: 100%; padding: 12px; background: #f8fafc; border: 1px solid var(--border-color);
            border-radius: 10px; color: var(--text-main); font-size: 16px !important; box-sizing: border-box;
            outline: none; height: 48px; transition: border 0.2s;
          }
          .styled-select:focus, .vertical-form input:focus { border-color: var(--accent); }

          .vertical-form { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }

          .tab-switcher { display: flex; background: #f1f5f9; padding: 4px; border-radius: 10px; gap: 4px; }
          .tab-btn {
            flex: 1; background: transparent; border: none; color: var(--text-muted);
            padding: 10px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;
          }
          .tab-btn.active { background: white; color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

          .btn-submit-form {
            background: var(--emerald); color: white; border: none; padding: 12px;
            border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 1rem; height: 48px;
          }
          .btn-submit-form:disabled { opacity: 0.4; cursor: not-allowed; }

          .flex-input-group { display: flex; gap: 8px; }
          .btn-add-plus {
            background: var(--accent); border: none; color: white; width: 48px; height: 48px;
            border-radius: 10px; font-size: 1.2rem; cursor: pointer;
          }

          .toolbar-card {
            background: var(--bg-card); border-radius: 16px; padding: 16px;
            border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px;
          }

          .category-scroll-chips {
            display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
            -webkit-overflow-scrolling: touch;
          }
          .category-scroll-chips::-webkit-scrollbar { display: none; }

          .chip-btn {
            background: #f1f5f9; border: 1px solid var(--border-color); color: var(--text-main);
            padding: 10px 16px; border-radius: 24px; white-space: nowrap; cursor: pointer;
            font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center;
          }
          .chip-btn.active { color: white !important; font-weight: 600; }

          .display-toggles { display: flex; flex-direction: column; gap: 12px; }
          .toggle-group-row { display: flex; gap: 8px; width: 100%; }
          .toggle-group {
            flex: 1; display: flex; background: #f1f5f9; padding: 4px; border-radius: 24px; border: 1px solid var(--border-color);
          }
          .toggle-group button {
            flex: 1; background: transparent; border: none; color: var(--text-muted);
            padding: 8px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; cursor: pointer;
          }
          .toggle-group button.active { background: var(--accent); color: white; }

          .styled-range-select {
            width: 100%; background: #f1f5f9; color: var(--text-main); border: 1px solid var(--border-color);
            padding: 10px; border-radius: 24px; font-size: 0.85rem; outline: none; height: 42px;
          }

          .matrix-title { font-weight: 700; font-size: 1rem; margin: 15px 0 10px 0; color: var(--text-main); }
          .asset-matrix-card {
            background: #f8fafc; border: 1px solid var(--border-color); border-radius: 12px;
            padding: 14px; margin-bottom: 12px;
          }
          .asset-matrix-header {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
          }
          .type-badge { font-size: 0.75rem; background: #e2e8f0; padding: 2px 8px; border-radius: 12px; color: var(--text-muted); font-weight: 600; }
          
          .matrix-checkbox-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px;
          }
          .matrix-checkbox-item {
            display: flex; align-items: center; gap: 6px; background: white; padding: 8px;
            border-radius: 8px; border: 1px solid var(--border-color); cursor: pointer; font-size: 0.85rem;
          }
          .matrix-checkbox-item.checked { background: #e0e7ff; border-color: #c7d2fe; font-weight: 600; }
          .scrollable-list { max-height: 380px; overflow-y: auto; padding-right: 4px; }

          .list-history-wrapper { margin-top: 20px; }
          .section-title-flat { font-size: 1.1rem; margin-bottom: 12px; font-weight: 600; color: var(--text-muted); }
          .records-feed { display: flex; flex-direction: column; gap: 8px; }

          .feed-item-card {
            background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px;
            padding: 14px; display: flex; justify-content: space-between; align-items: center;
          }
          .feed-left { display: flex; align-items: center; gap: 12px; }
          .icon-indicator {
            width: 38px; height: 38px; border-radius: 10px; background: #f1f5f9;
            display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
          }
          .feed-meta-details { display: flex; flex-direction: column; }
          .feed-title { font-weight: 600; font-size: 0.95rem; }
          .feed-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
          .feed-right { display: flex; align-items: center; gap: 12px; }
          .feed-value-tag { font-weight: 700; font-size: 1rem; }
          .income-green { color: var(--emerald); }
          .expense-dark { color: var(--text-main); }

          .feed-actions-hover { display: flex; gap: 4px; }
          .btn-circle-edit, .btn-circle-delete {
            background: #f1f5f9; border: 1px solid var(--border-color); border-radius: 8px;
            width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;
          }

          .modal-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 12px;
          }
          .modal-content {
            background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px;
            padding: 24px; width: 100%; max-width: 480px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
            max-height: 90vh; overflow-y: auto; box-sizing: border-box;
          }
          .text-left { text-align: left; }
          .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
          .close-modal { background: transparent; border: none; color: var(--text-muted); font-size: 1.6rem; cursor: pointer; }
          .modal-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
          .btn-save-action { background: var(--accent); color: white; border: none; padding: 12px; border-radius: 10px; font-weight: 600; cursor: pointer; }
          .list-item-row {
            display: flex; justify-content: space-between; align-items: center;
            background: #f8fafc; padding: 12px; border-radius: 10px; margin-bottom: 6px; border: 1px solid var(--border-color);
          }

          .custom-tooltip-box {
            background: white; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px;
            color: var(--text-main); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); font-size: 13px;
          }
          .tooltip-title { margin: 0 0 6px 0; font-weight: bold; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
          .tooltip-row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 3px; }

          .auth-wrapper-centered { display: flex; justify-content: center; align-items: center; min-height: 70vh; }
          .auth-hero-card { background: white; border: 1px solid var(--border-color); max-width: 440px; padding: 30px; border-radius: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .gradient-text { color: var(--accent); font-weight: 800; }
          .auth-title { font-size: 1.7rem; margin-bottom: 8px; }
          .auth-subtitle { color: var(--text-muted); font-size: 0.95rem; line-height: 1.4; }
          .auth-action-box { background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); margin-top: 20px; }
          .google-signin-btn-container { display: flex; justify-content: center; margin-top: 10px; }
        `}</style>
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;
