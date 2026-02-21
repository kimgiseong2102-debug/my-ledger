import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { 
  PlusCircle, 
  Trash2, 
  TrendingUp, 
  CreditCard, 
  Calendar,
  PieChart,
  LayoutDashboard,
  Download,
  PiggyBank,
  ListPlus,
  CheckCircle2,
  Settings,
  Info,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  LogOut
} from 'lucide-react';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBIPYc56O7YJNwDJSpvyF2TWipfDO5emjU",
  authDomain: "budget-book-4c5f0.firebaseapp.com",
  projectId: "budget-book-4c5f0",
  storageBucket: "budget-book-4c5f0.firebasestorage.app",
  messagingSenderId: "709449338698",
  appId: "1:709449338698:web:6e1b585d7d6742654d7bb3",
  measurementId: "G-VXR2883MD3"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'budget-book-4c5f0';

const DEFAULT_CATEGORIES = ['생활비', '식비', '저축 및 투자', '여가생활', '자동차 유지비', '기타'];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

// 차트 색상 매핑

const CATEGORY_COLORS = {
  '생활비': '#3b82f6', // blue-500
  '식비': '#ef4444', // red-500
  '자동차 유지비': '#f59e0b', // amber-500
  '여가생활': '#10b981', // emerald-500
  '저축 및 투자': '#6366f1', // indigo-500
  '기타': '#94a3b8' // slate-400
};

const getCategoryColor = (cat) => CATEGORY_COLORS[cat] || '#8b5cf6';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [view, setView] = useState('main'); 
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [transactions, setTransactions] = useState([]);
  const [fixedTemplates, setFixedTemplates] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');
  
  // 메인 입력 폼 상태
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense'); 
  const [subType, setSubType] = useState('variable'); 
  const [category, setCategory] = useState('생활비');

  // 고정지출 템플릿 폼 상태
  const [fixedDesc, setFixedDesc] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [fixedCat, setFixedCat] = useState('생활비');
  const [fixedDay, setFixedDay] = useState('1');
  const [fixedStartYear, setFixedStartYear] = useState(new Date().getFullYear());
  const [fixedStartMonth, setFixedStartMonth] = useState(new Date().getMonth() + 1);
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  // 1. 인증 초기화
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
        // 기존의 익명 로그인(signInAnonymously)은 보안을 위해 제거되었습니다.
      } catch (error) {
        console.error("인증 오류:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 구글 로그인 핸들러
  const handleGoogleLogin = async () => {
    setLoginError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("구글 로그인 실패:", error);
      setLoginError('로그인에 실패했습니다. 팝업 차단을 해제하거나 Firebase 설정을 확인해주세요.');
    }
  };

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("로그아웃 실패:", error);
    }
  };

  // 2. 데이터 실시간 불러오기
  useEffect(() => {
    if (!user) return;

    const transactionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const fixedRef = collection(db, 'artifacts', appId, 'users', user.uid, 'fixed_templates');
    const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories');
    
    const unsubTrans = onSnapshot(
      transactionsRef,
      (snapshot) => setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => console.error("Transactions 오류:", error)
    );

    const unsubFixed = onSnapshot(
      fixedRef,
      (snapshot) => {
        // createdAt 기준으로 정렬
        const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        templates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setFixedTemplates(templates);
      },
      (error) => console.error("Fixed Templates 오류:", error)
    );

    const unsubSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists() && snapshot.data().list) {
          setCategories(snapshot.data().list);
        } else {
          setCategories(DEFAULT_CATEGORIES);
        }
      },
      (error) => console.error("Settings 오류:", error)
    );

    return () => {
      unsubTrans();
      unsubFixed();
      unsubSettings();
    };
  }, [user]);

  // 카테고리 동기화 효과
  useEffect(() => {
    if (categories.length > 0) {
      if (!categories.includes(category)) setCategory(categories[0]);
      if (!categories.includes(fixedCat)) setFixedCat(categories[0]);
    }
  }, [categories]);

  // 필터링 및 계산
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getMonth() === selectedMonth && tDate.getFullYear() === selectedYear;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, selectedMonth, selectedYear]);

  const stats = useMemo(() => {
    const res = { totalIncome: 0, totalExpense: 0, fixedExpense: 0, variableExpense: 0, totalSavings: 0 };
    filteredTransactions.forEach(t => {
      const val = Number(t.amount);
      if (t.type === 'income') {
        res.totalIncome += val;
      } else {
        res.totalExpense += val;
        if (t.category === '저축 및 투자') res.totalSavings += val;
        if (t.subType === 'fixed') res.fixedExpense += val;
        else res.variableExpense += val;
      }
    });
    return res;
  }, [filteredTransactions]);

  const categoryStats = useMemo(() => {
    const catData = {};
    let totalExp = 0;
    
    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        const val = Number(t.amount);
        catData[t.category] = (catData[t.category] || 0) + val;
        totalExp += val;
      }
    });

    if (totalExp === 0) return [];

    return Object.entries(catData)
      .map(([cat, amt]) => ({
        category: cat,
        amount: amt,
        percentage: (amt / totalExp) * 100
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions]);

  // === 카테고리 관리 기능 ===
  const handleAddCategory = async (e) => {
    e.preventDefault();
    const trimmed = newCategory.trim();
    if (!user || !trimmed || categories.includes(trimmed)) return;
    const newList = [...categories, trimmed];
    setNewCategory('');
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories'), { list: newList });
  };

  const handleDeleteCategory = async (catToRemove) => {
    if (!user) return;
    const newList = categories.filter(c => c !== catToRemove);
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories'), { list: newList });
  };

  const moveCategory = async (index, direction) => {
    if (!user) return;
    const newList = [...categories];
    if (direction === 'left' && index > 0) {
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    } else if (direction === 'right' && index < newList.length - 1) {
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    } else return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories'), { list: newList });
  };

  // === 내역 추가 기능 ===
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!user || !amount || !description) return;

    const newEntry = {
      date, description, amount: parseInt(amount), type, 
      subType: type === 'income' ? 'none' : subType,
      category: type === 'income' ? '수입' : category,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), newEntry);
      setDescription(''); setAmount('');
    } catch (error) { console.error("문서 추가 오류:", error); }
  };

  const handleDeleteTransaction = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id));
    } catch (error) { console.error("문서 삭제 오류:", error); }
  };

  // === 고정지출 템플릿 관리 기능 ===
  const handleAddFixedTemplate = async (e) => {
    e.preventDefault();
    if (!user || !fixedAmount || !fixedDesc || !fixedDay || !fixedStartYear || !fixedStartMonth) return;

    const newTemplate = {
      description: fixedDesc,
      amount: parseInt(fixedAmount),
      category: fixedCat,
      day: parseInt(fixedDay),
      startYear: parseInt(fixedStartYear),
      startMonth: parseInt(fixedStartMonth),
      isActive: true, // 기본으로 활성화 상태
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'fixed_templates'), newTemplate);
      setFixedDesc(''); setFixedAmount(''); setFixedDay('1');
    } catch (error) { console.error("템플릿 추가 오류:", error); }
  };

  const handleToggleTemplate = async (id, currentStatus) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'fixed_templates', id);
      await updateDoc(docRef, { isActive: !currentStatus });
    } catch (error) { console.error("상태 변경 오류:", error); }
  };

  const handleDeleteTemplate = async (id) => {
    if (!user) return;
    if (!confirm("이 템플릿을 삭제하시겠습니까? (과거 가계부에 추가된 내역은 지워지지 않습니다)")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'fixed_templates', id));
    } catch (error) { console.error("템플릿 삭제 오류:", error); }
  };

  // ⭐️ 선택된 월에 고정지출 일괄 추가
  const handleBatchAddFixed = async () => {
    if (!user || fixedTemplates.length === 0) return;
    
    // 활성화된 템플릿만 필터링 (isActive가 false인 것 제외, 예전 데이터 호환 위해 !== false 처리)
    const activeTemplates = fixedTemplates.filter(t => t.isActive !== false);
    
    if (activeTemplates.length === 0) {
      alert("활성화된 고정지출 항목이 없습니다.");
      return;
    }

    setIsAddingBatch(true);
    const monthStr = String(selectedMonth + 1).padStart(2, '0');

    try {
      const transactionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
      const promises = activeTemplates.map(t => {
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const validDay = Math.min(t.day || 1, lastDayOfMonth);
        const targetDate = `${selectedYear}-${monthStr}-${String(validDay).padStart(2, '0')}`;

        return addDoc(transactionsRef, {
          date: targetDate,
          description: t.description,
          amount: t.amount,
          category: t.category,
          type: 'expense',
          subType: 'fixed',
          createdAt: new Date().toISOString()
        });
      });
      
      await Promise.all(promises);
      
      setTimeout(() => {
        setIsAddingBatch(false);
        setView('main');
      }, 800);
      
    } catch (error) {
      console.error("일괄 추가 오류:", error);
      setIsAddingBatch(false);
    }
  };

  // 엑셀 내보내기
  const exportToExcel = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['날짜', '설명', '분류', '타입', '금액'];
    const rows = filteredTransactions.map(t => [
      t.date, t.description, t.category, 
      t.type === 'income' ? '수입' : (t.subType === 'fixed' ? '고정지출' : '변동지출'), t.amount
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `가계부_${selectedYear}년_${MONTHS[selectedMonth]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  // === 로그인 화면 ===
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 max-w-sm w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-200">
            <PieChart size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">스마트 가계부</h1>
            <p className="text-sm text-slate-500 mt-2">나만의 데이터를 안전하게 관리하세요</p>
          </div>
          
          {loginError && (
            <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-medium leading-relaxed">
              {loginError}
            </div>
          )}

          <button 
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google 계정으로 로그인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-10">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setView('main')}
            >
              <div className="p-2 bg-blue-600 text-white rounded-lg">
                <PieChart size={24} />
              </div>
              <h1 className="text-xl font-bold tracking-tight hidden sm:block">나의 스마트 가계부</h1>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setView(view === 'main' ? 'fixed_manage' : 'main')}
                className={`flex items-center gap-2 text-sm font-bold px-3 py-2 rounded-lg transition-colors ${view === 'fixed_manage' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Settings size={18} />
                {view === 'fixed_manage' ? '가계부로 돌아가기' : '설정 및 관리'}
              </button>
              {view === 'main' && (
                <button onClick={exportToExcel} className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors hidden sm:flex">
                  <Download size={18} />
                  엑셀 저장
                </button>
              )}
              <button onClick={handleLogout} className="flex items-center gap-2 text-sm font-bold text-rose-500 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors">
                <LogOut size={18} />
                로그아웃
              </button>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* 연도 선택기 */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
              <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 text-slate-500 hover:bg-white hover:text-slate-800 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
              <span className="font-bold text-sm px-2">{selectedYear}년</span>
              <button onClick={() => setSelectedYear(y => y + 1)} className="p-1 text-slate-500 hover:bg-white hover:text-slate-800 rounded-lg transition-colors"><ChevronRight size={18} /></button>
            </div>

            {/* 월 선택기 */}
            <div className="flex overflow-x-auto no-scrollbar gap-1 bg-slate-100 p-1 rounded-xl flex-1">
              {MONTHS.map((month, index) => (
                <button
                  key={month}
                  onClick={() => setSelectedMonth(index)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                    selectedMonth === index ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {month}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {view === 'fixed_manage' ? (
          <div className="space-y-6 max-w-2xl mx-auto">
            
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
              <Info className="text-amber-500 shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="text-sm font-bold text-amber-800 mb-1">설정 및 관리 안내</h4>
                <p className="text-xs text-amber-700 leading-relaxed">
                  나만의 카테고리 순서를 변경하거나 고정지출을 관리할 수 있습니다. <b>이제 더 이상 지출하지 않는 항목은 'OFF'로 꺼두세요.</b> 항목을 삭제하거나 OFF로 변경해도, 이미 장부에 들어간 과거 기록은 절대 지워지지 않습니다.
                </p>
              </div>
            </div>

            {/* === 카테고리 관리 === */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><PieChart size={20} /></div>
                <h2 className="text-lg font-bold text-slate-800">카테고리 관리</h2>
              </div>
              
              <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
                <input type="text" placeholder="새 분류 추가 (예: 반려견)" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-700 text-sm whitespace-nowrap">추가</button>
              </form>

              <div className="flex flex-wrap gap-2">
                {categories.map((cat, idx) => (
                  <div key={cat} className="flex items-center gap-1 bg-slate-100 pl-1 pr-2 py-1.5 rounded-lg text-sm font-medium text-slate-700 shadow-sm border border-slate-200">
                    <div className="flex flex-col">
                      <button onClick={() => moveCategory(idx, 'left')} disabled={idx === 0} className="text-slate-400 hover:text-slate-800 disabled:opacity-30"><ChevronLeft size={14}/></button>
                    </div>
                    <span className="px-1">{cat}</span>
                    <div className="flex flex-col">
                      <button onClick={() => moveCategory(idx, 'right')} disabled={idx === categories.length - 1} className="text-slate-400 hover:text-slate-800 disabled:opacity-30"><ChevronRight size={14}/></button>
                    </div>
                    <button onClick={() => handleDeleteCategory(cat)} className="text-slate-300 hover:text-rose-500 ml-1 border-l border-slate-300 pl-2"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* === 고정지출 관리 === */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><ListPlus size={20} /></div>
                <h2 className="text-lg font-bold text-slate-800">고정지출 관리</h2>
              </div>

              {/* 템플릿 등록 폼 */}
              <form onSubmit={handleAddFixedTemplate} className="flex flex-col gap-3 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 font-bold ml-1">분류</label>
                    <select value={fixedCat} onChange={(e) => setFixedCat(e.target.value)} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold ml-1">지출 내용</label>
                    <input type="text" placeholder="예: 넷플릭스" value={fixedDesc} onChange={(e) => setFixedDesc(e.target.value)} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 h-[38px]">
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">적용시작</span>
                    <input type="number" value={fixedStartYear} onChange={(e) => setFixedStartYear(e.target.value)} className="w-12 bg-transparent text-sm font-bold text-center outline-none" />
                    <span className="text-xs text-slate-500">년</span>
                    <input type="number" min="1" max="12" value={fixedStartMonth} onChange={(e) => setFixedStartMonth(e.target.value)} className="w-8 bg-transparent text-sm font-bold text-center outline-none" />
                    <span className="text-xs text-slate-500">월 부터</span>
                  </div>

                  <div className="sm:col-span-3 flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-[38px]">
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">매월</span>
                    <input type="number" min="1" max="31" placeholder="일" value={fixedDay} onChange={(e) => setFixedDay(e.target.value)} className="w-10 bg-transparent text-sm font-bold text-center outline-none" />
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">일 결제</span>
                  </div>

                  <div className="sm:col-span-4 flex gap-2">
                    <input type="number" placeholder="금액" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} className="w-full px-3 bg-white border border-slate-200 rounded-lg text-sm font-bold h-[38px]" />
                    <button type="submit" className="h-[38px] px-4 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 text-sm whitespace-nowrap">등록</button>
                  </div>
                </div>
              </form>

              {/* 저장된 템플릿 리스트 */}
              <div className="space-y-3">
                {fixedTemplates.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">등록된 고정지출이 없습니다.</div>
                ) : (
                  fixedTemplates.map(t => {
                    const isActive = t.isActive !== false;
                    return (
                      <div key={t.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl transition-all ${isActive ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                        <div className="flex flex-col gap-1.5 mb-3 sm:mb-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">매월 {t.day || 1}일</span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{t.startYear}년 {t.startMonth}월부터 적용</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{t.category}</span>
                            <span className={`font-bold text-base ${isActive ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{t.description}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-3 sm:pt-0">
                          <span className={`font-black text-lg ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>₩{Number(t.amount).toLocaleString()}</span>
                          
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleToggleTemplate(t.id, isActive)} 
                              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-colors ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                            >
                              {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                              {isActive ? 'ON' : 'OFF'}
                            </button>
                            <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-300 hover:text-rose-500 p-1"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* 일괄 추가 버튼 영역 (월 직접 선택 가능) */}
            {fixedTemplates.length > 0 && (
              <div 
                key={`batch-${selectedYear}-${selectedMonth}`} 
                className="bg-blue-50 border border-blue-200 p-6 rounded-2xl text-center shadow-sm"
              >
                <div className="flex items-center justify-center gap-2 mb-4">
                  <select 
                    value={selectedYear} 
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="bg-white border border-blue-200 text-blue-800 font-bold px-3 py-1.5 rounded-lg text-lg outline-none cursor-pointer"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="bg-white border border-blue-200 text-blue-800 font-bold px-3 py-1.5 rounded-lg text-lg outline-none cursor-pointer"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <span className="text-lg font-bold text-slate-800">장부에 모두 추가할까요?</span>
                </div>
                
                <p className="text-xs text-slate-500 mb-5">
                  현재 'ON' 상태인 <b>{fixedTemplates.filter(t => t.isActive !== false).length}개</b>의 고정지출 내역이 선택하신 <b className="text-blue-600">{selectedYear}년 {MONTHS[selectedMonth]}</b>의 각 지정된 결제일로 한 번에 기록됩니다.
                </p>
                <button 
                  onClick={handleBatchAddFixed}
                  disabled={isAddingBatch || fixedTemplates.filter(t => t.isActive !== false).length === 0}
                  className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto transition-all"
                >
                  {isAddingBatch ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <><CheckCircle2 size={20} /> 네, 일괄 추가합니다</>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
        /* === 메인 가계부 뷰 === */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
              
              {/* 월별 요약 카드 */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <LayoutDashboard size={14} />
                  {selectedYear}년 {MONTHS[selectedMonth]} 통계
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-emerald-600">
                    <span className="text-sm font-medium">총 수입</span>
                    <span className="font-bold">₩{stats.totalIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-500">
                    <span className="text-sm font-medium">총 지출</span>
                    <span className="font-bold">₩{stats.totalExpense.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 flex justify-between items-center text-blue-600 bg-blue-50/50 p-2 rounded-lg">
                    <div className="flex items-center gap-1">
                      <PiggyBank size={14} />
                      <span className="text-xs font-bold">저축 및 투자</span>
                    </div>
                    <span className="text-sm font-bold">₩{stats.totalSavings.toLocaleString()}</span>
                  </div>
                  <div className="pt-4 border-t border-slate-50 space-y-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>ㄴ 고정 지출</span>
                      <span>₩{stats.fixedExpense.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ㄴ 변동 지출</span>
                      <span>₩{stats.variableExpense.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-sm font-bold">합계 (잔액)</span>
                    <span className={`text-lg font-black ${(stats.totalIncome - stats.totalExpense) >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                      ₩{(stats.totalIncome - stats.totalExpense).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 지출 분석 (원형 그래프) */}
              {categoryStats.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <PieChart size={14} />
                    지출 분류 분석
                  </h2>
                  <div className="flex items-center gap-5">
                    <div className="w-24 h-24 shrink-0 relative">
                      <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90 rounded-full">
                        <circle cx="21" cy="21" r="15.91549431" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
                        {categoryStats.map((item, idx) => {
                          const offset = -categoryStats.slice(0, idx).reduce((acc, curr) => acc + curr.percentage, 0);
                          return (
                            <circle
                              key={item.category}
                              cx="21" cy="21" r="15.91549431"
                              fill="transparent"
                              stroke={getCategoryColor(item.category)}
                              strokeWidth="6"
                              strokeDasharray={`${item.percentage} ${100 - item.percentage}`}
                              strokeDashoffset={offset}
                              className="transition-all duration-1000 ease-out"
                            />
                          );
                        })}
                      </svg>
                    </div>
                    <div className="flex-1 space-y-2.5">
                      {categoryStats.slice(0, 4).map(item => (
                        <div key={item.category} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(item.category) }}></div>
                            <span className="text-slate-600 truncate">{item.category}</span>
                          </div>
                          <span className="font-bold text-slate-800 shrink-0">{item.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 내역 입력 폼 */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 mb-4">새 내역 추가</h2>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setType('income')} className={`py-2 rounded-lg text-xs font-bold transition-all ${type === 'income' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>수입</button>
                    <button type="button" onClick={() => setType('expense')} className={`py-2 rounded-lg text-xs font-bold transition-all ${type === 'expense' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-slate-50 text-slate-400'}`}>지출</button>
                  </div>
                  {type === 'expense' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setSubType('fixed')} className={`py-2 rounded-lg text-xs font-medium ${subType === 'fixed' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>고정지출</button>
                      <button type="button" onClick={() => setSubType('variable')} className={`py-2 rounded-lg text-xs font-medium ${subType === 'variable' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>변동지출</button>
                    </div>
                  )}
                  <div className="space-y-3">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                    {type === 'expense' && (
                      <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    )}
                    <input type="text" placeholder="내역 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                    <input type="number" placeholder="금액 입력" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" />
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <PlusCircle size={18} /> 추가하기
                  </button>
                </form>
              </div>
            </div>

            {/* 내역 리스트 */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">거래 내역</h2>
                <span className="text-xs font-medium text-slate-400">{filteredTransactions.length}개의 내역</span>
              </div>
              <div className="space-y-3">
                {filteredTransactions.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-slate-100 rounded-2xl py-20 flex flex-col items-center justify-center text-slate-300">
                    <Calendar size={40} className="mb-2 opacity-20" />
                    <p className="text-sm">입력된 내역이 없습니다.</p>
                  </div>
                ) : (
                  filteredTransactions.map((t) => (
                    <div key={t.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-blue-100 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                          {t.type === 'income' ? <TrendingUp size={20} /> : <CreditCard size={20} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-800">{t.description}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                              t.type === 'income' ? 'bg-emerald-100 text-emerald-700' 
                              : t.category === '저축 및 투자' ? 'bg-blue-600 text-white'
                              : t.subType === 'fixed' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {t.type === 'income' ? '수입' : t.category === '저축 및 투자' ? '저축' : t.subType === 'fixed' ? '고정' : '변동'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{t.date} • {t.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className={`font-black text-lg ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {t.type === 'income' ? '+' : '-'} ₩{Number(t.amount).toLocaleString()}
                        </p>
                        <button onClick={() => handleDeleteTransaction(t.id)} className="text-slate-200 hover:text-rose-500 transition-colors p-1">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}