import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, Line, ComposedChart, Area
} from 'recharts';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import * as jwtDecodeModule from "jwt-decode";

const jwtDecode: any = (jwtDecodeModule as any).jwtDecode || (jwtDecodeModule as any).default || jwtDecodeModule;

const BACKEND_URL = "https://react-ideas-backend.onrender.com";
const GOOGLE_CLIENT_ID = "197361744572-ih728hq5jft3fqfd1esvktvrd8i97kcp.apps.googleusercontent.com";
const ASSET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const ADMIN_EMAILS = ['kovari.rudolf@gmail.com'];

const GAS_JELLEGGORBE_M3: { [month: string]: number } = {
  '01': 304,
  '02': 262,
  '03': 214,
  '04': 115,
  '05': 46,
  '06': 24,
  '07': 24,
  '08': 31,
  '09': 56,
  '10': 135,
  '11': 226,
  '12': 292
};
const ANNUAL_GAS_LIMIT_M3 = 1729;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("React Error Boundary elkapott egy hibát:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '50px 20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2>⚠️ Hiba történt a felület betöltésekor</h2>
          <p style={{ color: '#64748b', maxWidth: '500px', margin: '10px auto' }}>
            {this.state.error?.message || 'Ismeretlen hiba lépett fel a belépés során.'}
          </p>
          <button 
            onClick={() => { localStorage.removeItem('userToken'); window.location.reload(); }}
            style={{ padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', marginTop: '15px' }}
          >
            Újrapróbálkozás / Kijelentkezés
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function calculateTieredPowerCost(kwh: number, priceLow = 36, priceHigh = 70.1, limit = 210): number {
  const safeKwh = isNaN(kwh) || kwh < 0 ? 0 : kwh;
  if (safeKwh <= limit) {
    return safeKwh * priceLow;
  }
  return (limit * priceLow) + ((safeKwh - limit) * priceHigh);
}

function calculateExcelSolarSavings(totalCons: number, gridKwh: number, priceLow = 36, priceHigh = 70.1): number {
  const safeTotal = isNaN(totalCons) ? 0 : totalCons;
  const safeGrid = isNaN(gridKwh) ? 0 : gridKwh;
  const savedKwh = Math.max(0, safeTotal - safeGrid);
  if (savedKwh <= 0) return 0;

  if (safeTotal < 210) {
    return savedKwh * priceLow;
  } else {
    if (savedKwh <= 210) {
      return savedKwh * priceLow;
    }
    return (210 * priceLow) + ((savedKwh - 210) * priceHigh);
  }
}

function MainApp() {
  const [user, setUser] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sharedUsers, setSharedUsers] = useState<any[]>([]);
  const [myShares, setMyShares] = useState<any[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('all');
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'settings' | 'ev-solar' | 'rental'>('dashboard');
  const [dashboardViewMode, setDashboardViewMode] = useState<'general' | 'gas_jelleggorbe'>('general');
  const [selectedGasYear, setSelectedGasYear] = useState<string>(new Date().getFullYear().toString());

  const [txSearch, setTxSearch] = useState('');
  const [txAssetFilter, setTxAssetFilter] = useState('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');
  
  const [matrixSelectedAssetId, setMatrixSelectedAssetId] = useState<string>('');

  const [recordMode, setRecordMode] = useState<'meter' | 'invoice'>('meter');
  const [targetAssetId, setTargetAssetId] = useState('');
  const [type, setType] = useState('');
  const [value, setValue] = useState('');
  const [meterDate, setMeterDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  
  const [editingRecordId, setEditingRecordId] = useState<number | string | null>(null);
  const [editingRecordLType, setEditingRecordLType] = useState<'meter' | 'invoice' | null>(null);
  
  const [newAsset, setNewAsset] = useState({ 
    category: 'property', friendlyName: '', city: '', street: '', 
    houseNumber: '', plateNumber: '', fuelType: 'Benzin', area: '' 
  });
  const [newCategory, setNewCategory] = useState({ name: '', icon: '📄', type: 'both', isPublic: false });

  const [filter, setFilter] = useState<string[]>(['Összes']);
  const [viewMode, setViewMode] = useState('monthly'); 
  const [displayMode, setDisplayMode] = useState('cost');
  
  const [chartRange, setChartRange] = useState<number | 'all' | 'custom'>(12);
  const [customStartDate, setCustomStartDate] = useState<string>('2024-01');
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().substring(0, 7));

  const [assetCategoryMap, setAssetCategoryMap] = useState<{ [key: string]: string[] }>({});

  const [evLogs, setEvLogs] = useState<any[]>([]);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [editingEvLogId, setEditingEvLogId] = useState<number | null>(null);

  const [newEvLog, setNewEvLog] = useState({
    date: new Date().toISOString().split('T')[0],
    location: 'Napelem',
    start_soc: '',
    end_soc: '',
    kwh_amount: '',
    cost_huf: '0',
    charge_source: 'Napelem',
    driven_km: '',
    assetId: ''
  });

  const [benchmarkForm, setBenchmarkForm] = useState({
    month: new Date().toISOString().substring(0, 7),
    gasoline_price: '595',
    avg_consumption: '5.95',
    solar_kwh: '0',
    total_consumed_kwh: '0',
    grid_kwh: '0',
    grid_kwh_price: '36',
    market_kwh_price: '70.1',
    solar_investment: '1950400',
    ev_investment: '0'
  });

  const [rentalContracts, setRentalContracts] = useState<any[]>([]);
  const [rentalPayments, setRentalPayments] = useState<any[]>([]);
  const [selectedRentalAssetId, setSelectedRentalAssetId] = useState<string>('');

  const [rentalContractForm, setRentalContractForm] = useState({
    tenantEmail: '',
    monthlyRent: '120000',
    depositAmount: '240000'
  });

  const [rentalPaymentForm, setRentalPaymentForm] = useState({
    month: new Date().toISOString().substring(0, 7),
    rentPaid: '120000',
    utilitiesPaid: '0',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: 'Rendes havi utalás'
  });

  const isReadOnly = viewingUserId !== null && user && viewingUserId !== user.sub;
  const isAdmin = user && user.email && ADMIN_EMAILS.includes(user.email);

  function forceLogout() {
    try {
      googleLogout();
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    setRecords([]); setInvoices([]); setAssets([]); setCategories([]);
    setSharedUsers([]); setMyShares([]); setEvLogs([]); setBenchmarks([]);
    setRentalContracts([]); setRentalPayments([]);
    localStorage.removeItem('userToken');
  }

  function handleLoginSuccess(token: string) {
    try {
      let decoded: any = {};
      if (typeof jwtDecode === 'function') {
        decoded = jwtDecode(token);
      } else {
        throw new Error("JWT dekóder nem elérhető.");
      }

      if (!decoded || !decoded.sub) {
        throw new Error("Érvénytelen belépési adatok.");
      }

      setUser({ ...decoded, token });
      setViewingUserId(decoded.sub);
      localStorage.setItem('userToken', token);
      
      fetchAll(token, decoded.sub);
      fetchSharedAccounts(token);
      fetchMyShares(token);

      fetch(`${BACKEND_URL}/api/login-sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      }).catch(err => console.error(err));
    } catch (e) { 
      console.error("Login hiba:", e);
      forceLogout(); 
    }
  }

  function handleSwitchAccount(targetSub: string) {
    setViewingUserId(targetSub);
    if (user?.token) {
      fetchAll(user.token, targetSub);
    }
  }

  function handleEditRecord(item: any) {
    setEditingRecordId(item.Id || item.id);
    setEditingRecordLType(item.lType);
    setTargetAssetId(String(item.AssetId || ''));
    setType(item.Type || '');
    setValue(String(item.Value || ''));
    setRecordMode(item.lType);
    
    const formattedDateStr = String(item.d || item.Date || item.Month || '').substring(0, 10);
    if (item.lType === 'meter') {
      setMeterDate(formattedDateStr);
    } else {
      setInvoiceDate(formattedDateStr);
    }

    setActiveTab('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelRecordEdit() {
    setEditingRecordId(null);
    setEditingRecordLType(null);
    setValue('');
  }

  function handleCategoryFilterClick(catName: string) {
    if (catName === 'Összes' || catName === 'Összes kiadás') {
      setFilter([catName]);
      return;
    }

    setFilter(prev => {
      const cleanPrev = prev.filter(f => f !== 'Összes' && f !== 'Összes kiadás');
      if (cleanPrev.includes(catName)) {
        const updated = cleanPrev.filter(f => f !== catName);
        return updated.length === 0 ? ['Összes'] : updated;
      } else {
        return [...cleanPrev, catName];
      }
    });
  }

  function getIcon(t: string) {
    if (t === 'Összes') return '📊'; if (t === 'Összes kiadás') return '📉';
    const cat = categories.find(c => c.Name === t);
    return cat ? cat.Icon : '📄';
  }

  function getColor(t: string) {
    if (!t) return '#64748b';
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
        const str = String(t);
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
    }
  }

  function getAllowedTypes(assetId: string) {
    const allCatNames = categories.map(c => c.Name);
    if (!assetId || assetId === 'all') return allCatNames;
    
    if (assetCategoryMap[assetId]) {
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
  }

  async function fetchMyShares(token: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/shares/owned`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setMyShares(await res.json());
    } catch (e) { console.error(e); }
  }

  async function fetchSharedAccounts(token: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/shares/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const shared = await res.json();
        const safeShared = Array.isArray(shared) ? shared : [];
        setSharedUsers(safeShared);

        if (safeShared.length > 0 && user && viewingUserId === user.sub && assets.length === 0) {
          handleSwitchAccount(safeShared[0].owner_id);
        }
      }
    } catch (e) { console.error(e); }
  }

  async function fetchAll(token: string, targetId?: string) {
    const id = targetId || viewingUserId || user?.sub;
    if (!id || !token) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [recRes, invRes, assetRes, catRes, acRes, evRes, bmRes, rentConRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/records?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/invoices?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/assets?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/categories?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/asset-categories?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/ev-logs?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/benchmarks?userId=${id}`, { headers }),
        fetch(`${BACKEND_URL}/api/rentals/contracts`, { headers })
      ]);
      if (recRes.status === 401) return forceLogout();
      
      setRecords(recRes.ok ? await recRes.json() : []);
      setInvoices(invRes.ok ? await invRes.json() : []);
      
      const loadedAssets = assetRes.ok ? await assetRes.json() : [];
      const safeAssets = Array.isArray(loadedAssets) ? loadedAssets : [];
      setAssets(safeAssets);

      const propAssets = safeAssets.filter((a: any) => a.Category === 'property');
      if (propAssets.length > 0) {
        setSelectedRentalAssetId(String(propAssets[0].Id));
      } else {
        setSelectedRentalAssetId('');
      }

      setCategories(catRes.ok ? await catRes.json() : []);
      setEvLogs(evRes.ok ? await evRes.json() : []);
      
      const fetchedBm = bmRes.ok ? await bmRes.json() : [];
      setBenchmarks(Array.isArray(fetchedBm) ? fetchedBm : []);
      setRentalContracts(rentConRes.ok ? await rentConRes.json() : []);

      const acData = acRes.ok ? await acRes.json() : [];
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
  }

  useEffect(() => {
    if (selectedRentalAssetId && user?.token) {
      fetch(`${BACKEND_URL}/api/rentals/payments?assetId=${selectedRentalAssetId}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      })
      .then(res => res.json())
      .then(data => setRentalPayments(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
    } else {
      setRentalPayments([]);
    }
  }, [selectedRentalAssetId, user]);

  function handleBenchmarkMonthChange(newMonth: string) {
    const existing = benchmarks.find(b => b.month === newMonth);
    if (existing) {
      setBenchmarkForm({
        month: newMonth,
        gasoline_price: String(existing.gasoline_price ?? '595'),
        avg_consumption: String(existing.avg_consumption ?? '5.95'),
        solar_kwh: String(existing.solar_kwh ?? '0'),
        total_consumed_kwh: String(existing.total_consumed_kwh ?? '0'),
        grid_kwh: String(existing.grid_kwh ?? '0'),
        grid_kwh_price: String(existing.grid_kwh_price ?? '36'),
        market_kwh_price: String(existing.market_kwh_price ?? '70.1'),
        solar_investment: String(existing.solar_investment ?? '1950400'),
        ev_investment: String(existing.ev_investment ?? '0')
      });
    } else {
      setBenchmarkForm(prev => ({
        ...prev,
        month: newMonth,
        solar_kwh: '0',
        total_consumed_kwh: '0',
        grid_kwh: '0'
      }));
    }
  }

  function handleEditBenchmark(bm: any) {
    setBenchmarkForm({
      month: bm.month,
      gasoline_price: String(bm.gasoline_price ?? '595'),
      avg_consumption: String(bm.avg_consumption ?? '5.95'),
      solar_kwh: String(bm.solar_kwh ?? '0'),
      total_consumed_kwh: String(bm.total_consumed_kwh ?? '0'),
      grid_kwh: String(bm.grid_kwh ?? '0'),
      grid_kwh_price: String(bm.grid_kwh_price ?? '36'),
      market_kwh_price: String(bm.market_kwh_price ?? '70.1'),
      solar_investment: String(bm.solar_investment ?? '1950400'),
      ev_investment: String(bm.ev_investment ?? '0')
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSaveRentalContract() {
    if (!selectedRentalAssetId) return alert("Válassz ingatlant!");
    const res = await fetch(`${BACKEND_URL}/api/rentals/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({
        assetId: parseInt(selectedRentalAssetId),
        tenantEmail: rentalContractForm.tenantEmail,
        monthlyRent: parseFloat(rentalContractForm.monthlyRent),
        depositAmount: parseFloat(rentalContractForm.depositAmount)
      })
    });
    if (res.ok) fetchAll(user.token, viewingUserId!);
  }

  async function handleSaveRentalPayment() {
    if (!selectedRentalAssetId) return alert("Válassz ingatlant!");
    const res = await fetch(`${BACKEND_URL}/api/rentals/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({
        assetId: parseInt(selectedRentalAssetId),
        month: rentalPaymentForm.month,
        rentPaid: parseFloat(rentalPaymentForm.rentPaid || '0'),
        utilitiesPaid: parseFloat(rentalPaymentForm.utilitiesPaid || '0'),
        paymentDate: rentalPaymentForm.paymentDate,
        notes: rentalPaymentForm.notes
      })
    });
    if (res.ok) {
      const pRes = await fetch(`${BACKEND_URL}/api/rentals/payments?assetId=${selectedRentalAssetId}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await pRes.json();
      setRentalPayments(Array.isArray(data) ? data : []);
    }
  }

  async function handleSave() {
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
    if (res.ok) { setValue(''); setEditingRecordId(null); setEditingRecordLType(null); fetchAll(user.token, viewingUserId!); }
  }

  async function handleEvLogSave() {
    if (!newEvLog.kwh_amount) return alert("KWh megadása kötelező!");
    const url = editingEvLogId ? `${BACKEND_URL}/api/ev-logs/${editingEvLogId}` : `${BACKEND_URL}/api/ev-logs`;
    const res = await fetch(url, {
      method: editingEvLogId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({
        ...newEvLog,
        start_soc: newEvLog.start_soc ? parseInt(newEvLog.start_soc) : null,
        end_soc: newEvLog.end_soc ? parseInt(newEvLog.end_soc) : null,
        kwh_amount: parseFloat(newEvLog.kwh_amount),
        cost_huf: parseFloat(newEvLog.cost_huf || '0'),
        driven_km: parseInt(newEvLog.driven_km || '0'),
        assetId: newEvLog.assetId ? parseInt(newEvLog.assetId) : null
      })
    });
    if (res.ok) {
      setEditingEvLogId(null);
      setNewEvLog({
        date: new Date().toISOString().split('T')[0],
        location: 'Napelem',
        start_soc: '',
        end_soc: '',
        kwh_amount: '',
        cost_huf: '0',
        charge_source: 'Napelem',
        driven_km: '',
        assetId: ''
      });
      fetchAll(user.token, viewingUserId!);
    }
  }

  function handleEditEvLog(log: any) {
    setEditingEvLogId(log.id);
    setNewEvLog({
      date: String(log.date).substring(0, 10),
      location: log.location || '',
      start_soc: log.start_soc !== null ? String(log.start_soc) : '',
      end_soc: log.end_soc !== null ? String(log.end_soc) : '',
      kwh_amount: String(log.kwh_amount || ''),
      cost_huf: String(log.cost_huf || '0'),
      charge_source: log.charge_source || 'Napelem',
      driven_km: String(log.driven_km || ''),
      assetId: log.asset_id ? String(log.asset_id) : ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEvLogEdit() {
    setEditingEvLogId(null);
    setNewEvLog({
      date: new Date().toISOString().split('T')[0],
      location: 'Napelem',
      start_soc: '',
      end_soc: '',
      kwh_amount: '',
      cost_huf: '0',
      charge_source: 'Napelem',
      driven_km: '',
      assetId: ''
    });
  }

  async function handleBenchmarkSave() {
    const res = await fetch(`${BACKEND_URL}/api/benchmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({
        ...benchmarkForm,
        gasoline_price: parseFloat(benchmarkForm.gasoline_price),
        avg_consumption: parseFloat(benchmarkForm.avg_consumption),
        solar_kwh: parseFloat(benchmarkForm.solar_kwh || '0'),
        total_consumed_kwh: parseFloat(benchmarkForm.total_consumed_kwh || '0'),
        grid_kwh: parseFloat(benchmarkForm.grid_kwh || '0'),
        grid_kwh_price: parseFloat(benchmarkForm.grid_kwh_price || '36'),
        market_kwh_price: parseFloat(benchmarkForm.market_kwh_price || '70.1'),
        solar_investment: parseFloat(benchmarkForm.solar_investment || '1950400'),
        ev_investment: parseFloat(benchmarkForm.ev_investment || '0')
      })
    });
    if (res.ok) fetchAll(user.token, viewingUserId!);
  }

  async function handleAssetSave() {
    if (!newAsset.friendlyName) return alert("Név kötelező!");
    const res = await fetch(`${BACKEND_URL}/api/assets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(newAsset)
    });
    if (res.ok) { setNewAsset({ category: 'property', friendlyName: '', city: '', street: '', houseNumber: '', plateNumber: '', fuelType: 'Benzin', area: '' }); fetchAll(user.token); }
  }

  async function handleCategorySave() {
    if (!newCategory.name) return alert("Kategória név kötelező!");
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
    }
  }

  async function handleToggleCategoryForAsset(assetId: string, categoryName: string) {
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
  }

  async function handleCategoryDelete(id: number) {
    if (!window.confirm("Biztosan törlöd ezt a kategóriát?")) return;
    const res = await fetch(`${BACKEND_URL}/api/categories/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` }
    });
    if (res.ok) fetchAll(user.token);
  }

  async function handleShare() {
    if (!shareEmail) return;
    const res = await fetch(`${BACKEND_URL}/api/shares`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({ sharedWithEmail: shareEmail })
    });
    if (res.ok) { setShareEmail(''); fetchMyShares(user.token); }
  }

  async function revokeShare(id: number) {
    if (!window.confirm("Biztosan visszavonod a hozzáférést?")) return;
    const res = await fetch(`${BACKEND_URL}/api/shares/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` }
    });
    if (res.ok) fetchMyShares(user.token);
  }

  // ITT VOLT A KINULLÁZÓDOTT IS_METER_DISABLED DEFINÍCIÓJÁNAK HELYE!
  const isMeterDisabled = useMemo(() => {
    const asset = assets.find(a => String(a.Id) === String(targetAssetId));
    const currentCat = categories.find(c => c.Name === type);
    return asset?.Category === 'car' || currentCat?.Type === 'invoice_only' || currentCat?.Type === 'income';
  }, [targetAssetId, type, assets, categories]);

  const combinedList = useMemo(() => {
    const safeRecords = Array.isArray(records) ? records : [];
    const safeInvoices = Array.isArray(invoices) ? invoices : [];

    const formattedRecords = safeRecords.map(r => ({
      ...r,
      lType: 'meter',
      d: r.FormattedDate || r.Date
    }));

    const formattedInvoices = safeInvoices.map(i => ({
      ...i,
      lType: 'invoice',
      Value: i.Amount,
      d: i.Month
    }));

    return [...formattedRecords, ...formattedInvoices].sort(
      (a, b) => new Date(b.d).getTime() - new Date(a.d).getTime()
    );
  }, [records, invoices]);

  const filteredCombinedList = useMemo(() => {
    return combinedList.filter((item: any) => {
      const asset = assets.find(a => String(a.Id) === String(item.AssetId));
      const assetName = asset ? asset.FriendlyName.toLowerCase() : '';
      const itemType = item.Type ? item.Type.toLowerCase() : '';
      
      const searchMatch = 
        itemType.includes(txSearch.toLowerCase()) || 
        assetName.includes(txSearch.toLowerCase()) || 
        String(item.Value).includes(txSearch);
        
      const assetMatch = txAssetFilter === 'all' || String(item.AssetId) === txAssetFilter;
      const categoryMatch = txCategoryFilter === 'all' || item.Type === txCategoryFilter;
      
      return searchMatch && assetMatch && categoryMatch;
    });
  }, [combinedList, txSearch, txAssetFilter, txCategoryFilter, assets]);

  const uniqueLocations = useMemo(() => {
    const set = new Set<string>(['Napelem', 'Otthon', 'Tesla Supercharger', 'Ionity', 'Tea', 'Garázs Tondo']);
    const safeEv = Array.isArray(evLogs) ? evLogs : [];
    safeEv.forEach(log => { if (log && log.location) set.add(log.location); });
    return Array.from(set);
  }, [evLogs]);

  const solarEnergyBalanceData = useMemo(() => {
    const safeBm = Array.isArray(benchmarks) ? benchmarks : [];
    return safeBm.slice().sort((a, b) => String(a?.month || '').localeCompare(String(b?.month || ''))).map(bm => {
      const totalCons = parseFloat(bm?.total_consumed_kwh || 0) || 0;
      const gridKwh = parseFloat(bm?.grid_kwh || 0) || 0;
      const solarKwh = parseFloat(bm?.solar_kwh || 0) || 0;
      const selfConsumedSolar = Math.max(0, totalCons - gridKwh);

      return {
        month: bm?.month || '',
        solar: solarKwh,
        consumed: totalCons,
        grid: gridKwh,
        selfConsumed: selfConsumedSolar
      };
    });
  }, [benchmarks]);

  const evEfficiencyData = useMemo(() => {
    const safeEv = Array.isArray(evLogs) ? evLogs : [];
    const map: { [month: string]: { kwh: number; km: number; cost: number } } = {};
    safeEv.forEach(log => {
      if (!log || !log.date) return;
      const m = String(log.date).substring(0, 7);
      if (!map[m]) map[m] = { kwh: 0, km: 0, cost: 0 };
      map[m].kwh += parseFloat(log.kwh_amount || 0) || 0;
      map[m].km += parseInt(log.driven_km || 0) || 0;
      map[m].cost += parseFloat(log.cost_huf || 0) || 0;
    });

    return Object.keys(map).sort().map(m => {
      const d = map[m];
      const avgKwh100Km = d.km > 0 ? (d.kwh / d.km) * 100 : 0;
      const avgFtKm = d.km > 0 ? d.cost / d.km : 0;
      return {
        month: m,
        kwh100km: parseFloat(avgKwh100Km.toFixed(1)) || 0,
        ftKm: parseFloat(avgFtKm.toFixed(1)) || 0,
        totalKm: d.km
      };
    }).filter(d => d.totalKm > 0 || d.kwh100km > 0);
  }, [evLogs]);

  const roiMetrics = useMemo(() => {
    let totalKwh = 0;
    let totalPaidHuf = 0;
    let totalKm = 0;
    let solarKwh = 0;

    const locationBreakdown: { [loc: string]: number } = {};
    const safeEv = Array.isArray(evLogs) ? evLogs : [];
    const safeBm = Array.isArray(benchmarks) ? benchmarks : [];

    safeEv.forEach(log => {
      if (!log) return;
      const kwh = parseFloat(log.kwh_amount || 0) || 0;
      const huf = parseFloat(log.cost_huf || 0) || 0;
      const km = parseInt(log.driven_km || 0) || 0;

      totalKwh += kwh;
      totalPaidHuf += huf;
      totalKm += km;

      if (log.charge_source === 'Napelem') {
        solarKwh += kwh;
      }

      const loc = log.location || 'Egyéb';
      locationBreakdown[loc] = (locationBreakdown[loc] || 0) + kwh;
    });

    const latestBm = safeBm[0] || {
      gasoline_price: 595,
      avg_consumption: 5.95,
      solar_investment: 1950400,
      ev_investment: 0,
      grid_kwh_price: 36,
      market_kwh_price: 70.1
    };

    let totalGasolineEquivalentHuf = 0;
    safeEv.forEach(log => {
      if (!log) return;
      const logMonth = String(log.date || '').substring(0, 7);
      const bm = safeBm.find(b => b.month === logMonth) || latestBm;
      const km = parseInt(log.driven_km || 0) || 0;
      
      if (km > 0) {
        const gasCostPerKm = (parseFloat(bm.avg_consumption || 5.95) / 100) * parseFloat(bm.gasoline_price || 595);
        totalGasolineEquivalentHuf += km * gasCostPerKm;
      }
    });

    const evSavingsHuf = totalGasolineEquivalentHuf - totalPaidHuf;

    let solarHouseholdSavingsHuf = 0;
    safeBm.forEach(bm => {
      if (!bm) return;
      const totalCons = parseFloat(bm.total_consumed_kwh || 0) || 0;
      const gridKwh = parseFloat(bm.grid_kwh || 0) || 0;
      const lowPrice = parseFloat(bm.grid_kwh_price || 36) || 36;
      const highPrice = parseFloat(bm.market_kwh_price || 70.1) || 70.1;

      if (totalCons > 0) {
        solarHouseholdSavingsHuf += calculateExcelSolarSavings(totalCons, gridKwh, lowPrice, highPrice);
      }
    });

    const totalSavingsHuf = evSavingsHuf + solarHouseholdSavingsHuf;
    const totalInvestment = parseFloat(latestBm.solar_investment || 1950400) + parseFloat(latestBm.ev_investment || 0);
    const currentBalance = totalSavingsHuf - totalInvestment;

    let elapsedDays = 1;
    if (safeEv.length > 0 && safeEv[safeEv.length - 1]?.date) {
      const parsedDate = new Date(safeEv[safeEv.length - 1].date);
      if (!isNaN(parsedDate.getTime())) {
        elapsedDays = Math.max(1, Math.round((new Date().getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }

    const dailySavingsHuf = elapsedDays > 0 ? totalSavingsHuf / elapsedDays : 0;
    const remainingHuf = Math.max(0, totalInvestment - totalSavingsHuf);
    const remainingDays = dailySavingsHuf > 0 && isFinite(dailySavingsHuf) ? Math.round(remainingHuf / dailySavingsHuf) : 0;

    let estimatedPaybackDateStr = 'N/A';
    try {
      const d = new Date();
      if (remainingDays > 0 && isFinite(remainingDays)) {
        d.setDate(d.getDate() + remainingDays);
      }
      if (!isNaN(d.getTime())) {
        estimatedPaybackDateStr = d.toISOString().substring(0, 10);
      }
    } catch (e) {
      estimatedPaybackDateStr = 'N/A';
    }

    const greenRatio = totalKwh > 0 ? (solarKwh / totalKwh) * 100 : 0;
    const costPerKm = totalKm > 0 ? totalPaidHuf / totalKm : 0;

    const locationPieData = Object.keys(locationBreakdown).map(loc => ({
      name: loc,
      value: Math.round(locationBreakdown[loc])
    }));

    return {
      totalKwh,
      totalPaidHuf,
      totalKm,
      solarKwh,
      greenRatio,
      costPerKm,
      evSavingsHuf,
      solarHouseholdSavingsHuf,
      totalSavingsHuf,
      totalInvestment,
      currentBalance,
      elapsedDays,
      dailySavingsHuf,
      remainingDays,
      estimatedPaybackDate: estimatedPaybackDateStr,
      locationPieData
    };
  }, [evLogs, benchmarks]);

  const chartData = useMemo(() => {
    const dataMap: { [key: string]: any } = {};
    const safeRecords = Array.isArray(records) ? records : [];
    const safeInvoices = Array.isArray(invoices) ? invoices : [];

    const fRec = safeRecords.filter((r: any) => selectedAssetId === 'all' || String(r.AssetId) === String(selectedAssetId));
    const fInv = safeInvoices.filter((i: any) => selectedAssetId === 'all' || String(i.AssetId) === String(selectedAssetId));

    const isAll = filter.includes('Összes');
    const isAllExpense = filter.includes('Összes kiadás');

    if (displayMode === 'usage') {
      const assetTypeGroupMap: { [key: string]: { [catType: string]: any[] } } = {};
      
      fRec.filter((r: any) => (isAll || isAllExpense ? true : filter.includes(r.Type))).forEach((r: any) => {
        if (!assetTypeGroupMap[r.AssetId]) assetTypeGroupMap[r.AssetId] = {};
        if (!assetTypeGroupMap[r.AssetId][r.Type]) assetTypeGroupMap[r.AssetId][r.Type] = [];
        assetTypeGroupMap[r.AssetId][r.Type].push(r);
      });

      Object.keys(assetTypeGroupMap).forEach(assetId => {
        Object.keys(assetTypeGroupMap[assetId]).forEach(catType => {
          const sortedRecords = assetTypeGroupMap[assetId][catType].sort((a: any, b: any) => new Date(a.FormattedDate).getTime() - new Date(b.FormattedDate).getTime());
          
          const firstReadingPerMonth: { [key: string]: number } = {};
          sortedRecords.forEach((r: any) => {
            const monthKey = String(r.FormattedDate || '').substring(0, 7);
            if (monthKey && firstReadingPerMonth[monthKey] === undefined) {
              firstReadingPerMonth[monthKey] = parseFloat(r.Value || 0);
            }
          });

          const months = Object.keys(firstReadingPerMonth).sort();

          for (let i = 0; i < months.length - 1; i++) {
            const currentMonth = months[i];
            const nextMonth = months[i + 1];
            
            const v1 = firstReadingPerMonth[currentMonth];
            const v2 = firstReadingPerMonth[nextMonth];
            const diff = v2 - v1;

            if (diff >= 0) {
              const chartKey = viewMode === 'monthly' ? currentMonth : currentMonth.substring(0, 4);
              const asset = assets.find(a => String(a.Id) === String(assetId));
              const label = asset ? asset.FriendlyName : 'Egyéb';
              
              if (!dataMap[chartKey]) dataMap[chartKey] = { label: chartKey };
              dataMap[chartKey][label] = (dataMap[chartKey][label] || 0) + diff;
            }
          }
        });
      });
    } else {
      const keyLen = viewMode === 'monthly' ? 7 : 4;
      fInv.filter((inv: any) => {
        if (isAll) return true;
        if (isAllExpense) return categories.find(c => c.Name === inv.Type)?.Type !== 'income';
        return filter.includes(inv.Type);
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
    const sorted = Object.values(dataMap).sort((a: any, b: any) => String(a?.label || '').localeCompare(String(b?.label || '')));
    return chartRange === 'custom' 
      ? sorted.filter((item: any) => item.label >= customStartDate && item.label <= customEndDate)
      : (chartRange === 'all' ? sorted : sorted.slice(-chartRange));
  }, [records, invoices, assets, filter, displayMode, viewMode, selectedAssetId, chartRange, customStartDate, customEndDate, categories]);

  const renderCustomLegend = (props: any) => {
    const { payload } = props;
    if (!payload) return null;
    const filteredPayload = payload.filter((entry: any) => !entry.dataKey || !entry.dataKey.endsWith('_income'));

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', paddingTop: '10px', fontSize: '11px' }}>
        {filteredPayload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color, display: 'inline-block' }} />
            <span style={{ color: '#64748b', fontWeight: 600 }}>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const unit = displayMode === 'cost' ? 'Ft' : '';
      if (displayMode === 'usage') {
        const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry.value) || 0), 0);
        return (
          <div className="custom-tooltip-box">
            <p className="tooltip-title">{label}</p>
            {payload.map((entry: any, index: number) => (
              <div key={index} style={{ color: entry.color }} className="tooltip-row">
                <span>{entry.name}:</span>
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

  const GasCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip-box">
          <p className="tooltip-title">{data.monthName} ({data.monthKey})</p>
          <div className="tooltip-row" style={{ color: '#3b82f6' }}>
            <span>Tényleges Fogyasztás:</span>
            <span className="tooltip-val">{data.actualUsage} m³</span>
          </div>
          <div className="tooltip-row" style={{ color: '#ef4444' }}>
            <span>Jelleggörbe Limit:</span>
            <span className="tooltip-val">{data.jelleggorbeLimit} m³</span>
          </div>
          <div className="tooltip-row" style={{ color: data.monthlyDiff >= 0 ? '#10b981' : '#ef4444' }}>
            <span>Havi Különbség:</span>
            <span className="tooltip-val">{data.monthlyDiff >= 0 ? '+' : ''}{data.monthlyDiff} m³</span>
          </div>
          {data.gasCost > 0 && (
            <div className="tooltip-row font-emerald" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '4px' }}>
              <span>Gázszámla összege:</span>
              <span className="tooltip-val">{data.gasCost.toLocaleString()} Ft</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const GasCumCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip-box">
          <p className="tooltip-title">{data.monthName} ({data.monthKey})</p>
          <div className="tooltip-row" style={{ color: '#4f46e5' }}>
            <span>Halmozott Fogyasztás:</span>
            <span className="tooltip-val">{data.cumActual} m³</span>
          </div>
          <div className="tooltip-row" style={{ color: '#ef4444' }}>
            <span>Halmozott Keret Plafon:</span>
            <span className="tooltip-val">{data.cumLimit} m³</span>
          </div>
          {data.gasCost > 0 && (
            <div className="tooltip-row font-emerald" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '4px' }}>
              <span>Gázszámla összege:</span>
              <span className="tooltip-val">{data.gasCost.toLocaleString()} Ft</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const rentalCalculation = useMemo(() => {
    if (!selectedRentalAssetId) return null;
    const safeContracts = Array.isArray(rentalContracts) ? rentalContracts : [];
    const safeInvoices = Array.isArray(invoices) ? invoices : [];
    const safePayments = Array.isArray(rentalPayments) ? rentalPayments : [];

    const contract = safeContracts.find(c => String(c.asset_id) === selectedRentalAssetId);

    const propertyInvoices = safeInvoices.filter(i => String(i.AssetId) === selectedRentalAssetId);
    
    const monthlySummaryMap: { [month: string]: { utilitiesCost: number; rentCost: number; rentPaid: number; utilitiesPaid: number } } = {};

    propertyInvoices.forEach(inv => {
      const m = String(inv.Month || '').substring(0, 7);
      if (!m) return;
      if (!monthlySummaryMap[m]) monthlySummaryMap[m] = { utilitiesCost: 0, rentCost: contract ? parseFloat(contract.monthly_rent) : 120000, rentPaid: 0, utilitiesPaid: 0 };
      monthlySummaryMap[m].utilitiesCost += parseFloat(inv.Amount || 0);
    });

    safePayments.forEach(pay => {
      const m = pay.month;
      if (!m) return;
      if (!monthlySummaryMap[m]) monthlySummaryMap[m] = { utilitiesCost: 0, rentCost: contract ? parseFloat(contract.monthly_rent) : 120000, rentPaid: 0, utilitiesPaid: 0 };
      monthlySummaryMap[m].rentPaid += parseFloat(pay.rent_paid || 0);
      monthlySummaryMap[m].utilitiesPaid += parseFloat(pay.utilities_paid || 0);
    });

    let totalDue = 0;
    let totalPaid = 0;

    const monthlyBreakdown = Object.keys(monthlySummaryMap).sort().reverse().map(m => {
      const d = monthlySummaryMap[m];
      const monthDue = d.utilitiesCost + d.rentCost;
      const monthPaid = d.rentPaid + d.utilitiesPaid;
      const diff = monthPaid - monthDue;

      totalDue += monthDue;
      totalPaid += monthPaid;

      return {
        month: m,
        utilitiesCost: d.utilitiesCost,
        rentCost: d.rentCost,
        monthDue,
        monthPaid,
        diff
      };
    });

    const totalBalance = totalPaid - totalDue;

    return {
      contract,
      monthlyBreakdown,
      totalDue,
      totalPaid,
      totalBalance
    };
  }, [selectedRentalAssetId, rentalContracts, invoices, rentalPayments]);

  const propertyAssets = useMemo(() => {
    return assets.filter(a => a.Category === 'property');
  }, [assets]);

  return (
    <div className="app-container">
      
      <datalist id="charging-locations-list">
        {uniqueLocations.map((loc, idx) => (
          <option key={idx} value={loc} />
        ))}
      </datalist>

      {/* --- NAVBAR WITH ACCOUNT SWITCHER --- */}
      <header className="app-header">
        <div className="header-brand-section">
          <span className="brand-icon">⚡</span>
          <h2>Rezsiapp <span className="version-tag">2.0</span></h2>
        </div>
        
        {user && (
          <nav className="header-navigation-tabs">
            <button className={`nav-tab-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Műszerfal</button>
            <button className={`nav-tab-link ${activeTab === 'rental' ? 'active' : ''}`} onClick={() => setActiveTab('rental')}>🏠 Albérlet</button>
            <button className={`nav-tab-link ${activeTab === 'ev-solar' ? 'active' : ''}`} onClick={() => setActiveTab('ev-solar')}>⚡ Megtérülés & EV</button>
            <button className={`nav-tab-link ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>📜 Tranzakciók</button>
            <button className={`nav-tab-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ Beállítások</button>
          </nav>
        )}

        {user && (
          <div className="header-user-badge">
            {sharedUsers.length > 0 && (
              <select 
                className="form-control-select styled-range-select" 
                style={{ height: '36px', fontSize: '0.8rem !important' }}
                value={viewingUserId || user.sub} 
                onChange={(e) => handleSwitchAccount(e.target.value)}
              >
                <option value={user.sub}>👤 Saját fiók ({user.email})</option>
                {sharedUsers.map((su: any) => (
                  <option key={su.owner_id} value={su.owner_id}>🤝 {su.owner_email} fiókja</option>
                ))}
              </select>
            )}

            <img src={user.picture || 'https://via.placeholder.com/36'} alt="Avatar" className="user-round-avatar" />
            <button className="logout-trigger-btn" onClick={forceLogout} title="Kijelentkezés">🚪</button>
          </div>
        )}
      </header>

      {user ? (
        <div className="main-content-router">
          
          {/* ================= TAB 1: MŰSZERFAL ================= */}
          {activeTab === 'dashboard' && (
            <div className="dashboard-layout-grid">
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

                {!isReadOnly && assets.length > 0 && (
                  <div className="ui-widget-card">
                    <h3 className="card-heading-clean">{editingRecordId ? "✏️ Tranzakció szerkesztése" : "Új adat hozzáadása"}</h3>
                    <div className="mode-toggle-pill">
                      <button 
                        className={`pill-item ${recordMode === 'meter' ? 'active' : ''}`} 
                        onClick={() => setRecordMode('meter')}
                        disabled={isMeterDisabled}
                      >
                        {isMeterDisabled ? '🔒 Óraállás' : '📟 Óraállás'}
                      </button>
                      <button className={`pill-item ${recordMode === 'invoice' ? 'active' : ''}`} onClick={() => setRecordMode('invoice')}>💰 Számla</button>
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

              <section className="main-viewport-pane">
                
                {/* NÉZETVÁLTÓ KAPCSOLÓ (ÁLTALÁNOS vs GÁZFOGYASZTÁS & JELLEGGÖRBE) */}
                <div className="ui-widget-card" style={{ padding: '12px 20px' }}>
                  <div className="mode-toggle-pill" style={{ margin: 0 }}>
                    <button 
                      className={`pill-item ${dashboardViewMode === 'general' ? 'active' : ''}`} 
                      onClick={() => setDashboardViewMode('general')}
                    >
                      📊 Általános Rezsiköltségek
                    </button>
                    <button 
                      className={`pill-item ${dashboardViewMode === 'gas_jelleggorbe' ? 'active' : ''}`} 
                      onClick={() => setDashboardViewMode('gas_jelleggorbe')}
                    >
                      🔥 Gázfogyasztás & Jelleggörbe (1729 m³)
                    </button>
                  </div>
                </div>

                {dashboardViewMode === 'general' ? (
                  <>
                    <div className="ui-widget-card">
                      <div className="grid-wrapping-chips">
                        <button 
                          className={`grid-chip-item ${filter.includes('Összes') ? 'active' : ''}`} 
                          onClick={() => handleCategoryFilterClick('Összes')} 
                          style={filter.includes('Összes') ? {backgroundColor: getColor('Összes'), color:'white'} : {}}
                        >
                          📊 Összesen
                        </button>
                        
                        {displayMode === 'cost' && (
                          <button 
                            className={`grid-chip-item ${filter.includes('Összes kiadás') ? 'active' : ''}`} 
                            onClick={() => handleCategoryFilterClick('Összes kiadás')} 
                            style={filter.includes('Összes kiadás') ? {backgroundColor: getColor('Összes kiadás'), color:'white'} : {}}
                          >
                            📉 Összes kiadás
                          </button>
                        )}
                        
                        {visibleCategories.map(c => {
                          const isSelected = filter.includes(c.Name);
                          return (
                            <button 
                              key={c.Id} 
                              className={`grid-chip-item ${isSelected ? 'active' : ''}`} 
                              onClick={() => handleCategoryFilterClick(c.Name)} 
                              style={isSelected ? {backgroundColor: getColor(c.Name), color: 'white'} : {}}
                            >
                              {c.Icon} {c.Name}
                            </button>
                          );
                        })}
                      </div>

                      <div className="chart-filter-controls-row">
                        <div className="controls-left-side-modes">
                          <div className="compact-btn-group">
                            <button className={displayMode === 'usage' ? 'active' : ''} onClick={() => setDisplayMode('usage')}>Fogyasztás</button>
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
                      {assets.length > 0 ? (
                        <ResponsiveContainer width="100%" height={320}>
                          <BarChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="label" fontSize={11} stroke="#64748b" tickLine={false} />
                            <YAxis 
                              fontSize={11} 
                              stroke="#64748b" 
                              tickLine={false} 
                              axisLine={false} 
                              width={65}
                              tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toLocaleString()}k` : val}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.01)' }} />
                            <Legend content={renderCustomLegend} />
                            
                            {(selectedAssetId === 'all' ? assets : assets.filter(a => String(a.Id) === String(selectedAssetId))).map((asset, idx) => {
                              const color = ASSET_COLORS[idx % ASSET_COLORS.length];
                              return (
                                <React.Fragment key={asset.Id}>
                                  <Bar dataKey={asset.FriendlyName} name={asset.FriendlyName} stackId="expense" fill={color} radius={[3,3,0,0]} />
                                  <Bar 
                                    dataKey={`${asset.FriendlyName}_income`} 
                                    name={`${asset.FriendlyName} (Bevétel)`} 
                                    stackId="income" 
                                    fill={color} 
                                    opacity={0.45} 
                                    radius={[3,3,0,0]}
                                  />
                                </React.Fragment>
                              );
                            })}
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="empty-state-text" style={{ padding: '40px 20px' }}>
                          <h3>🌐 Nincs megjeleníthető adat</h3>
                          <p>Még nincs eszköz rögzítve ehhez a fiókhoz. Lépj a <b>Beállítások</b> fülre új eszköz hozzáadásához!</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  /* ================= GÁZFOGYASZTÁS & JELLEGGÖRBE NÉZET ================= */
                  <div className="form-stack-vertical">
                    
                    <div className="ui-widget-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h3 className="card-heading-clean" style={{ margin: 0 }}>🔥 Gázfogyasztási Jelleggörbe Elemzés</h3>
                        <small style={{ color: '#64748b' }}>A magyarországi rezsitámogatott keret (1 729 m³/év) hőmérsékletfüggő eloszlása szerint</small>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label className="input-label-flat" style={{ margin: 0 }}>Év szűrése:</label>
                        <select 
                          className="form-control-select styled-range-select" 
                          value={selectedGasYear} 
                          onChange={(e) => setSelectedGasYear(e.target.value)}
                        >
                          {availableGasYears.map(yr => (
                            <option key={yr} value={yr}>{yr}. év</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="kpi-cards-flex-grid">
                      <div className="ui-widget-card kpi-tile">
                        <span className="kpi-label">Támogatott Éves Keret</span>
                        <span className="kpi-value">{gasYearData.annualLimit.toLocaleString()} m³</span>
                        <small className="kpi-sub">Éves lakossági maximális limit</small>
                      </div>

                      <div className="ui-widget-card kpi-tile">
                        <span className="kpi-label">{selectedGasYear}. Évi Fogyasztás</span>
                        <span className="kpi-value font-emerald">{gasYearData.yearTotalActual.toLocaleString()} m³</span>
                        <small className="kpi-sub">Gázszámlák összege: {gasYearData.totalGasCost.toLocaleString()} Ft</small>
                      </div>

                      <div className="ui-widget-card kpi-tile">
                        <span className="kpi-label">Maradék Éves Keret</span>
                        <span className="kpi-value" style={{ color: gasYearData.yearRemainingLimit > 0 ? '#10b981' : '#ef4444' }}>
                          {gasYearData.yearRemainingLimit.toLocaleString()} m³
                        </span>
                        <small className="kpi-sub">{gasYearData.yearOverLimit > 0 ? `⚠️ Túllépés: ${gasYearData.yearOverLimit.toLocaleString()} m³` : 'Biztonságos támogatott sávban'}</small>
                      </div>
                    </div>

                    {/* 1. GRAFIKON: HAVI FOGYASZTÁS VS JELLEGGÖRBE LIMIT */}
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">📊 Havi Gázfogyasztás vs. Rezsikeret ({selectedGasYear})</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={gasYearData.monthlyList} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="monthName" fontSize={11} stroke="#64748b" tickLine={false} />
                          <YAxis fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} width={45} label={{ value: 'm³', angle: -90, position: 'insideLeft', style: { fontSize: '10px' } }} />
                          <Tooltip content={<GasCustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Bar dataKey="actualUsage" name="Tényleges Fogyasztás (m³)" fill="#3b82f6" radius={[4,4,0,0]} />
                          <Line type="monotone" dataKey="jelleggorbeLimit" name="Jelleggörbe Limit (m³)" stroke="#ef4444" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 2. GRAFIKON: HALMOZOTT FOGYASZTÁS VS KERET KERET */}
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">📈 Halmozott Éves Fogyasztás vs. Keretösszeg ({selectedGasYear})</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={gasYearData.monthlyList} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="monthName" fontSize={11} stroke="#64748b" tickLine={false} />
                          <YAxis domain={[0, 1800]} fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} width={45} label={{ value: 'Kumulált m³', angle: -90, position: 'insideLeft', style: { fontSize: '10px' } }} />
                          <Tooltip content={<GasCumCustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Area type="monotone" dataKey="cumActual" name="Halmozott Fogyasztás (m³)" fill="#e0e7ff" stroke="#4f46e5" strokeWidth={2} />
                          <Line type="monotone" dataKey="cumLimit" name="Halmozott Keret Plafon (m³)" stroke="#ef4444" strokeWidth={3} strokeDasharray="3 3" dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                  </div>
                )}
              </section>
            </div>
          )}

          {/* ================= TAB 2: ALBÉRLET KEZELÉS ================= */}
          {activeTab === 'rental' && (
            propertyAssets.length > 0 ? (
              <div className="dashboard-layout-grid">
                <aside className="sidebar-container">
                  <div className="ui-widget-card">
                    <label className="input-label-flat">Ingatlan Kiválasztása</label>
                    <select className="form-control-select" value={selectedRentalAssetId} onChange={(e) => setSelectedRentalAssetId(e.target.value)}>
                      {propertyAssets.map((a: any) => (
                        <option key={a.Id} value={String(a.Id)}>🏠 {a.FriendlyName}</option>
                      ))}
                    </select>
                  </div>

                  {!isReadOnly && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">⚙️ Szerződés & Bérlő beállítása</h3>
                      <div className="form-stack-vertical">
                        <div>
                          <label className="input-label-flat">Bérlő Google E-mail Címe</label>
                          <input 
                            type="email" 
                            className="form-control-select" 
                            placeholder="berlo@gmail.com" 
                            value={rentalContractForm.tenantEmail} 
                            onChange={(e) => setRentalContractForm({...rentalContractForm, tenantEmail: e.target.value})} 
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Havi Bérleti Díj (Ft)</label>
                            <input type="number" className="form-control-select" value={rentalContractForm.monthlyRent} onChange={(e) => setRentalContractForm({...rentalContractForm, monthlyRent: e.target.value})} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Kaució (Ft)</label>
                            <input type="number" className="form-control-select" value={rentalContractForm.depositAmount} onChange={(e) => setRentalContractForm({...rentalContractForm, depositAmount: e.target.value})} />
                          </div>
                        </div>
                        <button className="btn-action-primary" onClick={handleSaveRentalContract}>Szerződés & Megosztás Mentése</button>
                      </div>
                    </div>
                  )}

                  {!isReadOnly && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">💵 Befizetés Rögzítése</h3>
                      <div className="form-stack-vertical">
                        <div>
                          <label className="input-label-flat">Elszámolási Hónap</label>
                          <input type="month" className="form-control-select" value={rentalPaymentForm.month} onChange={(e) => setRentalPaymentForm({...rentalPaymentForm, month: e.target.value})} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Befizetett Bérleti Díj</label>
                            <input type="number" className="form-control-select" value={rentalPaymentForm.rentPaid} onChange={(e) => setRentalPaymentForm({...rentalPaymentForm, rentPaid: e.target.value})} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Befizetett Rezsi</label>
                            <input type="number" className="form-control-select" value={rentalPaymentForm.utilitiesPaid} onChange={(e) => setRentalPaymentForm({...rentalPaymentForm, utilitiesPaid: e.target.value})} />
                          </div>
                        </div>
                        <div>
                          <label className="input-label-flat">Fizetés Dátuma</label>
                          <input type="date" className="form-control-select" value={rentalPaymentForm.paymentDate} onChange={(e) => setRentalPaymentForm({...rentalPaymentForm, paymentDate: e.target.value})} />
                        </div>
                        <button className="btn-submit-form" onClick={handleSaveRentalPayment}>Befizetés Rögzítése</button>
                      </div>
                    </div>
                  )}
                </aside>

                <section className="main-viewport-pane">
                  {rentalCalculation && (
                    <>
                      <div className="kpi-cards-flex-grid">
                        <div className="ui-widget-card kpi-tile">
                          <span className="kpi-label">Kaució</span>
                          <span className="kpi-value">{parseFloat(rentalCalculation.contract?.deposit_amount || 0).toLocaleString()} Ft</span>
                          <small className="kpi-sub">Bérlő: {rentalCalculation.contract?.tenant_email || 'Nincs megadva'}</small>
                        </div>

                        <div className="ui-widget-card kpi-tile">
                          <span className="kpi-label">Havi Bérleti Díj</span>
                          <span className="kpi-value font-emerald">{parseFloat(rentalCalculation.contract?.monthly_rent || 0).toLocaleString()} Ft/hó</span>
                          <small className="kpi-sub">Szerződéses alapdíj</small>
                        </div>

                        <div className="ui-widget-card kpi-tile">
                          <span className="kpi-label">Göngyölített Egyenleg</span>
                          <span className="kpi-value" style={{ color: rentalCalculation.totalBalance >= 0 ? '#10b981' : '#ef4444' }}>
                            {rentalCalculation.totalBalance >= 0 ? '+' : ''}{Math.round(rentalCalculation.totalBalance).toLocaleString()} Ft
                          </span>
                          <small className="kpi-sub">{rentalCalculation.totalBalance >= 0 ? 'Túlfizetés' : 'Elmaradás / Hátralék'}</small>
                        </div>
                      </div>

                      <div className="ui-widget-card scrollable-list" style={{ maxHeight: '500px' }}>
                        <h3 className="card-heading-clean">📋 Havi Rezsi + Bérleti Díj Elszámolás</h3>
                        {rentalCalculation.monthlyBreakdown.length > 0 ? (
                          <div className="modern-data-table-stack">
                            {rentalCalculation.monthlyBreakdown.map((row: any) => (
                              <div key={row.month} className="table-row-card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{row.month}</div>
                                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Rezsi: {Math.round(row.utilitiesCost).toLocaleString()} Ft • Bérleti díj: {Math.round(row.rentCost).toLocaleString()} Ft
                                  </div>
                                </div>
                                
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                                    Fizetendő: <span style={{ color: '#0f172a' }}>{Math.round(row.monthDue).toLocaleString()} Ft</span>
                                  </div>
                                  <div style={{ fontSize: '0.8rem' }}>
                                    Befizetve: <span className="font-emerald">{Math.round(row.monthPaid).toLocaleString()} Ft</span> 
                                    {row.diff !== 0 && (
                                      <span style={{ color: row.diff > 0 ? '#10b981' : '#ef4444', marginLeft: '6px', fontWeight: 700 }}>
                                        ({row.diff > 0 ? '+' : ''}{Math.round(row.diff).toLocaleString()} Ft)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state-text">Még nincs elszámolás ehhez az ingatlanhoz.</div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            ) : (
              <div className="ui-widget-card" style={{ padding: '50px 20px', textAlign: 'center' }}>
                <span style={{ fontSize: '3rem' }}>🔒</span>
                <h3 style={{ marginTop: '10px' }}>Nincs ingatlan hozzárendelve</h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '10px auto 0 auto' }}>
                  Ehhez a fiókhoz még nincs ingatlan rögzítve vagy megosztva. Ha te vagy a tulajdonos, adj hozzá egy ingatlant a <b>Beállítások</b> fülön!
                </p>
              </div>
            )
          )}

          {/* ================= TAB 3: MEGTÉRÜLÉS & EV TÖLTÉS ================= */}
          {activeTab === 'ev-solar' && (
            assets.length > 0 ? (
              <div className="dashboard-layout-grid">
                <aside className="sidebar-container">
                  {!isReadOnly && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">{editingEvLogId ? "✏️ EV Töltés szerkesztése" : "🔌 Új EV Töltés rögzítése"}</h3>
                      <div className="form-stack-vertical">
                        <div>
                          <label className="input-label-flat">Dátum</label>
                          <input type="date" className="form-control-select" value={newEvLog.date} onChange={(e) => setNewEvLog({...newEvLog, date: e.target.value})} />
                        </div>
                        
                        <div>
                          <label className="input-label-flat">Töltőhely (Szabadon beírható)</label>
                          <input 
                            type="text" 
                            list="charging-locations-list" 
                            className="form-control-select" 
                            placeholder="pl. Napelem, Tesla, Ionity..." 
                            value={newEvLog.location} 
                            onChange={(e) => setNewEvLog({...newEvLog, location: e.target.value})} 
                          />
                        </div>

                        <div>
                          <label className="input-label-flat">Töltési forrás</label>
                          <select className="form-control-select" value={newEvLog.charge_source} onChange={(e) => setNewEvLog({...newEvLog, charge_source: e.target.value})}>
                            <option value="Napelem">☀️ Napelem (Ingyenes)</option>
                            <option value="Hálózat">🏠 Otthoni Hálózat</option>
                            <option value="Nyilvános">⚡ Nyilvános Töltő</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Kezdő %</label>
                            <input type="number" className="form-control-select" placeholder="pl. 25%" value={newEvLog.start_soc} onChange={(e) => setNewEvLog({...newEvLog, start_soc: e.target.value})} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Feltöltött %</label>
                            <input type="number" className="form-control-select" placeholder="pl. 80%" value={newEvLog.end_soc} onChange={(e) => setNewEvLog({...newEvLog, end_soc: e.target.value})} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Betöltött kWh</label>
                            <input type="number" step="0.01" className="form-control-select" placeholder="kWh" value={newEvLog.kwh_amount} onChange={(e) => setNewEvLog({...newEvLog, kwh_amount: e.target.value})} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Költség (Ft)</label>
                            <input type="number" className="form-control-select" placeholder="Ft" value={newEvLog.cost_huf} onChange={(e) => setNewEvLog({...newEvLog, cost_huf: e.target.value})} />
                          </div>
                        </div>

                        <div>
                          <label className="input-label-flat">Megtett KM (utolsó töltés óta)</label>
                          <input type="number" className="form-control-select" placeholder="pl. 150 km" value={newEvLog.driven_km} onChange={(e) => setNewEvLog({...newEvLog, driven_km: e.target.value})} />
                        </div>

                        <div className="action-buttons-row">
                          <button className="btn-submit-form" onClick={handleEvLogSave}>
                            {editingEvLogId ? 'Módosítás mentése' : 'Töltés mentése'}
                          </button>
                          {editingEvLogId && <button className="btn-action-primary" style={{backgroundColor: '#64748b'}} onClick={cancelEvLogEdit}>Mégse</button>}
                        </div>
                      </div>
                    </div>
                  )}

                  {!isReadOnly && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">☀️ Napelem & Áram Referencia</h3>
                      <div className="form-stack-vertical">
                        <div>
                          <label className="input-label-flat">Hónap Kiválasztása</label>
                          <input 
                            type="month" 
                            className="form-control-select" 
                            value={benchmarkForm.month} 
                            onChange={(e) => handleBenchmarkMonthChange(e.target.value)} 
                          />
                        </div>

                        <div>
                          <label className="input-label-flat">Összes Háztartási Fogyasztás (kWh)</label>
                          <input type="number" step="0.1" className="form-control-select" placeholder="pl. 325 kWh" value={benchmarkForm.total_consumed_kwh} onChange={(e) => setBenchmarkForm({...benchmarkForm, total_consumed_kwh: e.target.value})} />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Napelem Termelés (kWh)</label>
                            <input type="number" step="0.1" className="form-control-select" placeholder="kWh" value={benchmarkForm.solar_kwh} onChange={(e) => setBenchmarkForm({...benchmarkForm, solar_kwh: e.target.value})} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Hálózati Vételezés (kWh)</label>
                            <input type="number" step="0.1" className="form-control-select" placeholder="kWh" value={benchmarkForm.grid_kwh} onChange={(e) => setBenchmarkForm({...benchmarkForm, grid_kwh: e.target.value})} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Benzinár (Ft/l)</label>
                            <input type="number" className="form-control-select" value={benchmarkForm.gasoline_price} onChange={(e) => setBenchmarkForm({...benchmarkForm, gasoline_price: e.target.value})} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="input-label-flat">Ref. Fogy. (l/100km)</label>
                            <input type="number" step="0.1" className="form-control-select" value={benchmarkForm.avg_consumption} onChange={(e) => setBenchmarkForm({...benchmarkForm, avg_consumption: e.target.value})} />
                          </div>
                        </div>

                        <div>
                          <label className="input-label-flat">Napelem Beruházás (Ft)</label>
                          <input type="number" className="form-control-select" value={benchmarkForm.solar_investment} onChange={(e) => setBenchmarkForm({...benchmarkForm, solar_investment: e.target.value})} />
                        </div>

                        <button className="btn-action-primary" onClick={handleBenchmarkSave}>Adatok mentése ehhez a hónaphoz</button>
                      </div>
                    </div>
                  )}
                </aside>

                <section className="main-viewport-pane">
                  <div className="kpi-cards-flex-grid">
                    <div className="ui-widget-card kpi-tile">
                      <span className="kpi-label">Zöld Áram Arány</span>
                      <span className="kpi-value font-emerald">{roiMetrics.greenRatio.toFixed(1)}%</span>
                      <small className="kpi-sub">{roiMetrics.solarKwh.toFixed(1)} kWh napelemből</small>
                    </div>

                    <div className="ui-widget-card kpi-tile">
                      <span className="kpi-label">EV Költség / KM</span>
                      <span className="kpi-value">{roiMetrics.costPerKm.toFixed(1)} Ft/km</span>
                      <small className="kpi-sub">Megtett: {roiMetrics.totalKm.toLocaleString()} km</small>
                    </div>

                    <div className="ui-widget-card kpi-tile">
                      <span className="kpi-label">Összes Megtakarítás</span>
                      <span className="kpi-value font-emerald">+{Math.round(roiMetrics.totalSavingsHuf).toLocaleString()} Ft</span>
                      <small className="kpi-sub">EV: {Math.round(roiMetrics.evSavingsHuf).toLocaleString()} Ft | Áram: {Math.round(roiMetrics.solarHouseholdSavingsHuf).toLocaleString()} Ft</small>
                    </div>

                    <div className="ui-widget-card kpi-tile">
                      <span className="kpi-label">Megtérülési Egyenleg</span>
                      <span className="kpi-value" style={{ color: roiMetrics.currentBalance >= 0 ? '#10b981' : '#ef4444' }}>
                        {roiMetrics.currentBalance >= 0 ? '+' : ''}{Math.round(roiMetrics.currentBalance).toLocaleString()} Ft
                      </span>
                      <small className="kpi-sub">Beruházás: {Math.round(roiMetrics.totalInvestment).toLocaleString()} Ft</small>
                    </div>
                  </div>

                  <div className="ui-widget-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 className="card-heading-clean" style={{ margin: 0 }}>📊 Várható Megtérülés: <span className="highlight-blue">{roiMetrics.estimatedPaybackDate}</span></h3>
                      <span className="row-badge-type">Napi átlag: +{Math.round(roiMetrics.dailySavingsHuf).toLocaleString()} Ft/nap</span>
                    </div>

                    <div className="roi-progress-wrapper">
                      <div className="roi-progress-bar" style={{ width: `${Math.min(100, Math.max(0, (roiMetrics.totalSavingsHuf / (roiMetrics.totalInvestment || 1)) * 100))}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                      <span>Eltelt napok: {roiMetrics.elapsedDays} nap</span>
                      <span>Hátralévő napok: {roiMetrics.remainingDays} nap</span>
                    </div>
                  </div>

                  {solarEnergyBalanceData.length > 0 && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">☀️ Havi Energia Mérleg (kWh)</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={solarEnergyBalanceData} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="month" fontSize={11} stroke="#64748b" tickLine={false} />
                          <YAxis fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} width={45} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Bar dataKey="consumed" name="Összes Fogyasztás" fill="#3b82f6" radius={[3,3,0,0]} />
                          <Bar dataKey="solar" name="Napelem Termelés" fill="#10b981" radius={[3,3,0,0]} />
                          <Bar dataKey="grid" name="Hálózati Vételezés" fill="#ef4444" radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {evEfficiencyData.length > 0 && (
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">🚗 Autó Fogyasztási & Km-Költség Trend</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart data={evEfficiencyData} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="month" fontSize={11} stroke="#64748b" tickLine={false} />
                          <YAxis yAxisId="left" fontSize={11} stroke="#8b5cf6" tickLine={false} axisLine={false} width={45} label={{ value: 'kWh/100km', angle: -90, position: 'insideLeft', style: { fontSize: '10px', fill: '#8b5cf6' } }} />
                          <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="#10b981" tickLine={false} axisLine={false} width={45} label={{ value: 'Ft/km', angle: 90, position: 'insideRight', style: { fontSize: '10px', fill: '#10b981' } }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Bar yAxisId="left" dataKey="kwh100km" name="Fogyasztás (kWh/100km)" fill="#8b5cf6" radius={[3,3,0,0]} />
                          <Line yAxisId="right" type="monotone" dataKey="ftKm" name="Költség (Ft/km)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="ui-widget-card scrollable-list" style={{ maxHeight: '250px' }}>
                    <h3 className="card-heading-clean">☀️ Historikus Napelem & Áram Referenciák</h3>
                    <div className="modern-data-table-stack">
                      {benchmarks.map((bm: any) => {
                        const totalCons = parseFloat(bm.total_consumed_kwh || 0);
                        const gridKwh = parseFloat(bm.grid_kwh || 0);
                        const savedKwh = Math.max(0, totalCons - gridKwh);

                        return (
                          <div key={bm.id || bm.month} className="table-row-card" style={{ padding: '8px 12px' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{bm.month}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Benzin: {bm.gasoline_price} Ft/l • Fogyasztás: {totalCons} kWh (Hálózat: {gridKwh} kWh)
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem' }} className="font-emerald">Megspórolt: {savedKwh.toFixed(1)} kWh</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Termelt: {bm.solar_kwh || 0} kWh</div>
                              </div>
                              {!isReadOnly && (
                                <div className="row-buttons-trigger">
                                  <button onClick={() => handleEditBenchmark(bm)}>✏️</button>
                                  <button onClick={async () => { if(window.confirm(`Biztosan törlöd a ${bm.month} havi referenciát?`)) { await fetch(`${BACKEND_URL}/api/benchmarks/${bm.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` } }); fetchAll(user.token); } }}>❌</button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {benchmarks.length === 0 && <div className="empty-state-text">Még nincs rögzített havi referencia.</div>}
                    </div>
                  </div>

                  <div className="dashboard-layout-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="ui-widget-card">
                      <h3 className="card-heading-clean">🎯 Töltőhelyek Megoszlása (kWh)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={roiMetrics.locationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                            {roiMetrics.locationPieData.map((_, idx) => (
                              <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val) => `${val} kWh`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="ui-widget-card scrollable-list" style={{ maxHeight: '280px' }}>
                      <h3 className="card-heading-clean">📜 Töltési Napló (Szerkeszthető)</h3>
                      <div className="modern-data-table-stack">
                        {evLogs.map((log: any) => (
                          <div key={log.id} className="table-row-card" style={{ padding: '8px 12px' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{log.location} ({log.charge_source})</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {String(log.date).substring(0, 10)} 
                                {log.start_soc !== null && log.end_soc !== null ? ` • ${log.start_soc}% ➔ ${log.end_soc}%` : ''} 
                                {log.driven_km ? ` • ${log.driven_km} km` : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem' }} className="font-emerald">{log.kwh_amount} kWh</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{parseFloat(log.cost_huf).toLocaleString()} Ft</div>
                              </div>
                              {!isReadOnly && (
                                <div className="row-buttons-trigger">
                                  <button onClick={() => handleEditEvLog(log)}>✏️</button>
                                  <button onClick={async () => { if(window.confirm("Biztosan törlöd a töltést?")) { await fetch(`${BACKEND_URL}/api/ev-logs/${log.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` } }); fetchAll(user.token); } }}>❌</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </section>
              </div>
            ) : (
              <div className="ui-widget-card" style={{ padding: '50px 20px', textAlign: 'center' }}>
                <span style={{ fontSize: '3rem' }}>⚡</span>
                <h3 style={{ marginTop: '10px' }}>Nincs elérhető eszköz</h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '10px auto 0 auto' }}>
                  A megtérülési és EV töltési adatok követéséhez hozz létre egy eszközt (ingatlant vagy járművet) a <b>Beállítások</b> fülön!
                </p>
              </div>
            )
          )}

          {/* ================= TAB 4: TRANZAKCIÓK ================= */}
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

          {/* ================= TAB 5: BEÁLLÍTÁSOK ================= */}
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
                <h3 className="card-heading-clean">{editingCategoryId ? "✏️ Kategória szerkesztése" : "⚙️ Új kategória hozzáadása"}</h3>
                <div className="vertical-form mt-2">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      style={{ width: '70px' }} 
                      className="form-control-select" 
                      placeholder="Ikon" 
                      value={newCategory.icon} 
                      onChange={(e) => setNewCategory({...newCategory, icon: e.target.value})} 
                    />
                    <input 
                      className="form-control-select" 
                      placeholder="Kategória neve" 
                      value={newCategory.name} 
                      onChange={(e) => setNewCategory({...newCategory, name: e.target.value})} 
                    />
                  </div>
                  <select className="form-control-select" value={newCategory.type} onChange={(e) => setNewCategory({...newCategory, type: e.target.value})}>
                    <option value="both">📟 Óraállás + 💰 Számla (Kiadás)</option>
                    <option value="invoice_only">Csak 💰 Számla (Kiadás)</option>
                    <option value="income">💵 Bevétel (Csak Számla)</option>
                  </select>
                  
                  {isAdmin && (
                    <label className="checkbox-matrix-tile" style={{ padding: '8px 12px', background: 'transparent', border: 'none' }}>
                      <input 
                        type="checkbox" 
                        checked={newCategory.isPublic} 
                        onChange={(e) => setNewCategory({...newCategory, isPublic: e.target.checked})} 
                      />
                      <span style={{ fontSize: '0.85rem' }}>🌐 Publikus (Mindenki látja)</span>
                    </label>
                  )}
                  
                  <div className="action-buttons-row">
                    <button className="btn-submit-form" onClick={handleCategorySave}>
                      Kategória mentése
                    </button>
                    {editingCategoryId && (
                      <button className="btn-action-primary" style={{ backgroundColor: '#64748b' }} onClick={() => { setEditingCategoryId(null); setNewCategory({ name: '', icon: '📄', type: 'both', isPublic: false }); }}>
                        Mégse
                      </button>
                    )}
                  </div>
                </div>

                <div className="shares-static-list mt-3 scrollable-list" style={{ maxHeight: '200px' }}>
                  {categories.map((c: any) => {
                    const isPublicCat = !c.UserId;
                    return (
                      <div key={c.Id} className="share-list-row-item">
                        <span style={{ fontWeight: 600 }}>{c.Icon} {c.Name} {isPublicCat ? '🌐 (Publikus)' : '🔒 (Privát)'}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button className="flat-delete-btn" style={{ color: 'var(--accent)' }} onClick={() => { setEditingCategoryId(c.Id); setNewCategory({ name: c.Name, icon: c.Icon, type: c.Type, isPublic: isPublicCat }); }}>✏️</button>
                          {(!isPublicCat || isAdmin) && (
                            <button className="flat-delete-btn" onClick={() => handleCategoryDelete(c.Id)}>❌</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

      {/* --- STYLES ENGINE --- */}
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

        .form-control-select {
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
        .form-control-select:focus {
          border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08); background-color: #ffffff;
        }
        .form-stack-vertical { display: flex; flex-direction: column; gap: 12px; }
        .action-buttons-row { display: flex; gap: 8px; }

        .mode-toggle-pill { display: flex; background: #f1f5f9; padding: 4px; border-radius: 10px; gap: 4px; margin-bottom: 4px; }
        .pill-item { flex: 1; background: transparent; border: none; padding: 8px; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 8px; }
        .pill-item.active { background: white; color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .pill-item:disabled { opacity: 0.4; cursor: not-allowed; background: #e2e8f0; color: #a1a1aa; }

        .btn-submit-form, .btn-action-primary {
          background: var(--emerald); color: white; border: none; padding: 12px; border-radius: 10px;
          font-weight: 700; font-size: 0.95rem; cursor: pointer; height: 46px; transition: opacity 0.2s; text-align: center; width: 100%;
        }
        .btn-action-primary { background: var(--accent); }
        .btn-submit-form:disabled { opacity: 0.4; cursor: not-allowed; }

        .flex-input-group { display: flex; gap: 8px; }
        .btn-add-plus { background: var(--accent); border: none; color: white; width: 46px; height: 46px; border-radius: 10px; font-size: 1.2rem; cursor: pointer; }

        .grid-wrapping-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
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

        .kpi-cards-flex-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
        .kpi-tile { display: flex; flex-direction: column; gap: 4px; }
        .kpi-label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
        .kpi-value { font-size: 1.4rem; font-weight: 800; }
        .kpi-sub { font-size: 0.75rem; color: var(--text-muted); }

        .roi-progress-wrapper { background: #e2e8f0; height: 16px; border-radius: 10px; overflow: hidden; }
        .roi-progress-bar { background: var(--emerald); height: 100%; transition: width 0.4s ease-in-out; }

        .search-filter-card-wrapper { margin-bottom: 16px; padding: 14px !important; }
        .search-filter-grid-layout { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
        @media (max-width: 768px) { .search-filter-grid-layout { grid-template-columns: 1fr; } }

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

        .share-list-row-item { display: flex; justify-content: space-between; padding: 8px; background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; align-items: center; }
        .flat-delete-btn { background: transparent; border: none; color: var(--rose); cursor: pointer; }
        .custom-tooltip-box { background: white; padding: 10px; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.06); font-size: 12px; z-index: 99; }
        .tooltip-title { margin: 0 0 4px 0; font-weight: bold; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
        .tooltip-row { display: flex; justify-content: space-between; gap: 12px; }
        .font-emerald { color: var(--emerald); }
        .font-rose { color: var(--rose); }
        .auth-wrapper-centered { display: flex; justify-content: center; align-items: center; min-height: 50vh; }
        .auth-hero-card { background: white; border: 1px solid var(--border); padding: 30px; border-radius: 16px; }
        .gradient-text { color: var(--accent); font-weight: 800; }
        .scrollable-list { overflow-y: auto; padding-right: 4px; }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <MainApp />
      </GoogleOAuthProvider>
    </ErrorBoundary>
  );
}
