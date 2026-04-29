import React, { useState, useEffect } from 'react';
import { Calendar, Wifi, RefreshCcw, Sparkles, Trash2, Calculator, Globe, Loader2, Send, Settings, X, Users, ChevronDown, ChevronUp, ImagePlus, Bell, BellRing } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeLotteryText, LoteryResponse } from './services/gemini';

const XSMB_STRUCTURE = [
  { id: 'ĐB', label: 'Đặc Biệt', shortLabel: 'ĐB', count: 1 },
  { id: '1', label: 'Giải Nhất', shortLabel: 'G.1', count: 1 },
  { id: '2', label: 'Giải Nhì', shortLabel: 'G.2', count: 2 },
  { id: '3', label: 'Giải Ba', shortLabel: 'G.3', count: 6 },
  { id: '4', label: 'Giải Tư', shortLabel: 'G.4', count: 4 },
  { id: '5', label: 'Giải Năm', shortLabel: 'G.5', count: 6 },
  { id: '6', label: 'Giải Sáu', shortLabel: 'G.6', count: 3 },
  { id: '7', label: 'Giải Bảy', shortLabel: 'G.7', count: 4 },
];

export default function App() {
  const [currentDate, setCurrentDate] = useState('');
  const [drawTime, setDrawTime] = useState('');
  const [source, setSource] = useState('minhngoc');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // init state from localStorage if available
  const [aiResult, setAiResult] = useState<LoteryResponse | null>(() => {
    try {
      const savedAi = localStorage.getItem('lottery_aiResult');
      const savedTime = localStorage.getItem('lottery_saveTime');
      if (savedAi && savedTime) {
        if (Date.now() - parseInt(savedTime, 10) < 24 * 60 * 60 * 1000) {
          return JSON.parse(savedAi);
        }
      }
    } catch {}
    return null;
  });
  
  const [calcResult, setCalcResult] = useState<any>(() => {
    try {
      const savedCalc = localStorage.getItem('lottery_calcResult');
      const savedTime = localStorage.getItem('lottery_saveTime');
      if (savedCalc && savedTime) {
        if (Date.now() - parseInt(savedTime, 10) < 24 * 60 * 60 * 1000) {
          return JSON.parse(savedCalc);
        }
      }
    } catch {}
    return null;
  });
  
  const [expandedKhach, setExpandedKhach] = useState<Record<number, boolean>>({});
  
  const [selectedImage, setSelectedImage] = useState<{base64: string, mime: string} | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showLotteryTable, setShowLotteryTable] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [payoutRates, setPayoutRates] = useState({
    lo: 80000,
    de: 80,
    xien2: 10,
    xien3: 40,
    xien4: 100
  });

  const [liveResults, setLiveResults] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (aiResult) {
      localStorage.setItem('lottery_aiResult', JSON.stringify(aiResult));
      localStorage.setItem('lottery_saveTime', Date.now().toString());
    } else {
      localStorage.removeItem('lottery_aiResult');
      localStorage.removeItem('lottery_saveTime');
    }
  }, [aiResult]);

  useEffect(() => {
    if (calcResult) {
      localStorage.setItem('lottery_calcResult', JSON.stringify(calcResult));
    } else {
      localStorage.removeItem('lottery_calcResult');
    }
  }, [calcResult]);

  useEffect(() => {
    const today = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    setCurrentDate(today);
  }, []);

  // Fetch Lottery Results
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchLottery = async () => {
      try {
        let url = `/api/lottery?source=${source}`;
        if (selectedDate) {
          const [yyyy, mm, dd] = selectedDate.split('-');
          url += `&date=${dd}-${mm}-${yyyy}`;
        }
        
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Server status: ${res.status}`);
        }
        const text = await res.text();
        const data = JSON.parse(text);
        if (data && !data.error) {
          setLiveResults({
            'ĐB': data.dac_biet || [],
            '1': data.giai_1 || [],
            '2': data.giai_2 || [],
            '3': data.giai_3 || [],
            '4': data.giai_4 || [],
            '5': data.giai_5 || [],
            '6': data.giai_6 || [],
            '7': data.giai_7 || [],
          });
          setDrawTime(data.time || '');
        } else if (data.error) {
          // Reset if no data
          setLiveResults({});
          setDrawTime('Chưa có lịch sử / KQ');
        }
      } catch (err) {
        console.error("Failed to fetch lottery:", err);
      }
    };

    fetchLottery();
    
    const isToday = !selectedDate || new Date(selectedDate).toDateString() === new Date().toDateString();
    
    if (isToday) {
      interval = setInterval(fetchLottery, 30000); // 30s refresh
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [source, selectedDate]);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setIsSubscribed(sub !== null);
        });
      });
    }
  }, []);

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Trình duyệt không hỗ trợ Push Notifications');
      return;
    }

    try {
      setIsSubscribing(true);
      if (Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          alert('Bạn đã từ chối nhận thông báo.');
          return;
        }
      }

      const res = await fetch('/api/vapidPublicKey');
      const publicVapidKey = await res.text();

      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await fetch('/api/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: {
          'content-type': 'application/json'
        }
      });
      setIsSubscribed(true);
      alert('Đăng ký nhận thông báo thành công! Chúng tôi sẽ gửi thông báo khi có kết quả mới.');
    } catch (err) {
      console.error(err);
      alert('Có lỗi khi đăng ký thông báo.');
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim() && !selectedImage) return;
    setIsAnalyzing(true);
    
    try {
      const data = await analyzeLotteryText(inputText, selectedImage?.base64, selectedImage?.mime);
      
      let maxGuestIndex = 0;
      (aiResult?.danh_sach || []).forEach(k => {
        const match = k.khach_hang?.match(/^Khách-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxGuestIndex) maxGuestIndex = num;
        }
      });

      const newDanhSach = (data.danh_sach || []).map(khach => {
        const name = khach.khach_hang?.trim() || "";
        if (!name || name.toLowerCase().includes('khách vãng lai') || name.toLowerCase().includes('không tên')) {
          maxGuestIndex++;
          return { ...khach, khach_hang: `Khách-${maxGuestIndex.toString().padStart(2, '0')}` };
        }
        return khach;
      });

      const mergedAiResult = {
        danh_sach: [
          ...newDanhSach,
          ...(aiResult?.danh_sach || [])
        ]
      };
      
      setAiResult(mergedAiResult);
      
      // Clear input
      setInputText('');
      setSelectedImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Auto update calculation if it already exists
      if (calcResult) {
        setIsCalculating(true);
        try {
          const res = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: mergedAiResult,
              lottery: {
                lo_2so: Object.values(liveResults).flat().map((num: string) => num.slice(-2)).filter(Boolean),
                de_2so: liveResults['ĐB']?.[0]?.slice(-2) ? [liveResults['ĐB'][0].slice(-2)] : []
              },
              rates: payoutRates
            })
          });
          
          if (!res.ok) throw new Error('Lỗi từ server');
          const calcData = await res.json();
          setCalcResult(calcData);
        } catch (e) {
          console.error("Lỗi khi update tính toán", e);
        } finally {
          setIsCalculating(false);
        }
      }

    } catch (error) {
      console.error(error);
      alert('Có lỗi khi phân tích: ' + (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setAiResult(null);
    setCalcResult(null);
    setExpandedKhach({});
    setSelectedImage(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file hình ảnh hợp lệ.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setSelectedImage({
        base64: base64Data,
        mime: file.type
      });
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCalculate = async () => {
    if (!aiResult) {
      alert('Vui lòng nhập liệu và nhấn AI Phân Tích trước khi tính toán!');
      return;
    }
    
    setIsCalculating(true);
    try {
      // Use current liveResults for calculation
      // But we need to flatten them for the backend if it expects a specific format
      // Or we can just fetch the latest from API again in the backend which is safer
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: aiResult,
          lottery: {
            lo_2so: Object.values(liveResults).flat().map(num => num.slice(-2)).filter(Boolean),
            de_2so: liveResults['ĐB']?.[0]?.slice(-2) ? [liveResults['ĐB'][0].slice(-2)] : []
          },
          rates: payoutRates
        })
      });
      
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const text = await res.text();
      try {
        const result = JSON.parse(text);
        if (result.error) {
          throw new Error(result.error);
        }
        setCalcResult(result);
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error("Lỗi API: Không thể đọc dữ liệu trả về.");
        }
        throw e;
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tính toán kết quả");
    } finally {
      setIsCalculating(false);
    }
  };

  const winningNumbers = new Set<string>();
  const winningDeNumbers = new Set<string>();

  if (calcResult && calcResult.danh_sach) {
    calcResult.danh_sach.forEach((khach: any) => {
      if (khach.chi_tiet_ket_qua) {
        khach.chi_tiet_ket_qua.forEach((win: any) => {
          if (!win.isWin) return;
          const loai = (win.loai || '').toLowerCase();
          if (loai === 'đề') {
            winningDeNumbers.add(win.so);
          } else if (loai === 'lô') {
            winningNumbers.add(win.so);
          } else if (loai.startsWith('xiên')) {
            if (typeof win.so === 'string') {
              win.so.split('-').forEach((s: string) => winningNumbers.add(s));
            }
          }
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-slate-200 flex justify-center font-sans text-slate-800">
      {/* Container */}
      <div className="w-full max-w-6xl bg-white min-h-screen shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <header className="bg-indigo-600 text-white pt-8 pb-4 px-5 rounded-b-3xl shadow-md z-10 flex-shrink-0 h-[118px]">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">KẾT QUẢ XSMB</h1>
              <div className="flex flex-col space-y-0.5 mt-1">
                <div className="flex items-center space-x-1.5 text-indigo-200 text-[10px] md:text-xs">
                  <Calendar size={12} />
                  <span className="capitalize">{currentDate}</span>
                </div>
                {drawTime && (
                  <div className="flex items-center space-x-1.5 text-white/90 text-[11px] md:text-xs font-bold">
                    <RefreshCcw size={12} className="animate-pulse" />
                    <span>{drawTime}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button 
                  onClick={subscribeToPush}
                  disabled={isSubscribing || isSubscribed}
                  className={`bg-indigo-500/50 hover:bg-indigo-500/70 backdrop-blur-sm p-2 rounded-full transition-colors border border-indigo-400 ${isSubscribed ? 'opacity-100 flex gap-1 items-center px-3' : 'opacity-80'}`}
                  title={isSubscribed ? "Đã đăng ký nhận thông báo" : "Nhận thông báo khi có kết quả mới"}
                >
                  {isSubscribed ? (
                    <>
                      <BellRing size={16} className="text-green-300" />
                      <span className="text-[10px] font-bold text-green-100">Đã đăng ký</span>
                    </>
                  ) : (
                    <Bell size={16} className="text-white animate-pulse" />
                  )}
                </button>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="bg-indigo-500/50 hover:bg-indigo-500/70 backdrop-blur-sm p-2 rounded-full transition-colors border border-indigo-400 opacity-80"
                >
                  <Settings size={16} className="text-white" />
                </button>
              </div>
              <div className="bg-indigo-500/50 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center space-x-1.5 border border-indigo-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-indigo-50">Live</span>
              </div>
            </div>
          </div>
        </header>

        {/* Settings Modal */}
        {showSettings && (
          <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl w-full shadow-2xl overflow-hidden flex flex-col max-w-[320px]"
            >
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-700 uppercase tracking-widest text-xs flex items-center gap-2">
                  <Settings size={14} className="text-indigo-500" /> Cài đặt tỷ lệ
                </h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-slate-600 bg-white p-1 rounded-full shadow-sm border border-slate-200"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Tỷ lệ Lô (VNĐ / 1 điểm)</label>
                  <input type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono font-bold transition-all shadow-inner"
                    value={payoutRates.lo}
                    onChange={e => setPayoutRates({...payoutRates, lo: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Tỷ lệ Đề (VNĐ / 1k cược)</label>
                  <input type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono font-bold transition-all shadow-inner"
                    value={payoutRates.de}
                    onChange={e => setPayoutRates({...payoutRates, de: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Xiên 2 (VNĐ / 1k cược)</label>
                  <input type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono font-bold transition-all shadow-inner"
                    value={payoutRates.xien2}
                    onChange={e => setPayoutRates({...payoutRates, xien2: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Xiên 3 (VNĐ / 1k cược)</label>
                  <input type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono font-bold transition-all shadow-inner"
                    value={payoutRates.xien3}
                    onChange={e => setPayoutRates({...payoutRates, xien3: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Xiên 4 (VNĐ / 1k cược)</label>
                  <input type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono font-bold transition-all shadow-inner"
                    value={payoutRates.xien4}
                    onChange={e => setPayoutRates({...payoutRates, xien4: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-white">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-[0_4px_10px_rgba(79,70,229,0.3)] hover:bg-indigo-700 active:scale-[0.98] transition-all"
                >
                  Xác nhận
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Body scrollable content */}
        <main className="flex-grow overflow-y-auto pb-24 px-4 md:px-6 pt-5 bg-slate-50 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Lottery Results */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-4">
              
              {/* Data Sources */}
              <section className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Globe size={14} className="text-slate-400" />
                    Nguồn dữ liệu KQXS
                  </h2>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex space-x-3 w-full sm:w-1/2">
                    <button 
                      onClick={() => setSource('xosome')}
                      className={`flex-1 py-2 md:py-2.5 min-h-[44px] rounded-xl text-xs md:text-sm font-bold transition-all ${
                        source === 'xosome' 
                          ? 'bg-blue-100 text-blue-700 border-2 border-blue-200 shadow-sm scale-[1.02]' 
                          : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      xoso.me
                    </button>
                    <button 
                      onClick={() => setSource('minhngoc')}
                      className={`flex-1 py-2 md:py-2.5 min-h-[44px] rounded-xl text-xs md:text-sm font-bold transition-all ${
                        source === 'minhngoc' 
                          ? 'bg-orange-100 text-orange-700 border-2 border-orange-200 shadow-sm scale-[1.02]' 
                          : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      minhngoc.net
                    </button>
                  </div>
                  <div className="w-full sm:w-1/2">
                    <input 
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 md:py-2.5 min-h-[44px] px-3 text-sm font-bold text-slate-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-inner"
                      title="Chọn ngày lịch sử để xem kết quả"
                    />
                  </div>
                </div>
              </section>

              {/* Lottery Table */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div 
                  className="bg-slate-50 px-4 py-3 md:py-4 border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => setShowLotteryTable(!showLotteryTable)}
                >
                  <div className="flex items-center gap-2">
                    {showLotteryTable ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
                    <span className="text-sm md:text-base font-bold text-slate-700">Bảng Kết Quả</span>
                  </div>
                  {Object.values(liveResults).flat().includes('') || Object.values(liveResults).every(v => v.length === 0) ? (
                    <RefreshCcw size={16} className="text-blue-500 animate-[spin_3s_linear_infinite]" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                       <span className="text-white text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </div>
                
                <AnimatePresence initial={false}>
                  {showLotteryTable && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-2 md:p-4 space-y-1 md:space-y-2">
                        {XSMB_STRUCTURE.map((prize) => {
                          const results = liveResults[prize.id] || [];
                          
                          return (
                            <div key={prize.id} className="flex flex-row border-b border-dotted border-slate-200 last:border-0 items-stretch overflow-hidden">
                              <div className="w-10 sm:w-16 md:w-28 flex-shrink-0 flex items-center justify-center font-bold text-[11px] md:text-sm uppercase tracking-wider text-slate-500 bg-slate-50/50 md:bg-transparent border-r border-slate-100 p-1 md:p-3">
                                <span className="md:hidden">{prize.shortLabel}</span>
                                <span className="hidden md:inline">{prize.label}</span>
                              </div>
                              <div className={`flex-grow p-1.5 sm:p-2 md:p-3 items-center min-h-[50px] sm:min-h-[60px] md:min-h-[70px] grid gap-1.5 md:gap-4 ${
                                prize.count === 1 ? 'grid-cols-1' :
                                prize.count === 2 ? 'grid-cols-2' :
                                prize.count === 3 ? 'grid-cols-3' :
                                prize.count === 4 ? 'grid-cols-2 md:grid-cols-4' : // 4
                                'grid-cols-3 md:grid-cols-3 xl:grid-cols-6' // 6 items
                              }`}>
                                {Array.from({ length: prize.count }).map((_, i) => {
                                  const num = results[i];
                                  const isEmpty = num === undefined || num === '';
                                  
                                  return (
                                    <div key={i} className={`flex justify-center items-center h-full ${prize.count > 1 ? 'bg-slate-50/50 py-1 md:py-1.5 rounded-md md:rounded-lg min-h-[28px]' : ''}`}>
                                      {isEmpty ? (
                                        <div className="text-slate-300 font-mono text-base md:text-xl flex space-x-0.5 md:space-x-1 items-center">
                                          <motion.span
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                                          >0</motion.span>
                                          <motion.span
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                                          >0</motion.span>
                                          <motion.span
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                                          >0</motion.span>
                                        </div>
                                      ) : (() => {
                                        const last2 = num.slice(-2);
                                        const isDeWin = prize.id === 'ĐB' && winningDeNumbers.has(last2);
                                        const isLoWin = winningNumbers.has(last2);
                                        const isWinning = isDeWin || isLoWin;
                                        
                                        return (
                                          <span className={`font-mono text-base sm:text-lg md:text-2xl font-bold tracking-widest px-2 py-0.5 transition-all ${
                                            isWinning 
                                              ? 'bg-green-500 text-white rounded-lg shadow-md scale-110' 
                                              : prize.id === 'ĐB' ? 'text-red-600 text-xl md:text-4xl' 
                                              : prize.id === '1' ? 'text-blue-600 text-lg md:text-2xl' 
                                              : 'text-slate-800'
                                          }`}>
                                            {isWinning && num.length > 2 ? (
                                              <>
                                                <span className="opacity-80 font-normal">{num.slice(0, -2)}</span>
                                                <span className="font-extrabold">{last2}</span>
                                              </>
                                            ) : (
                                              num
                                            )}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>

            {/* Right Column: Calculations */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-4">
              
              {/* Quick Input Section */}
              <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nạp liệu nhanh</h2>
                </div>
                
                <div className="flex gap-3">
                  <div className="flex-grow flex flex-col gap-2">
                    <textarea
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm md:text-base focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none resize-none h-28 md:h-32 shadow-inner transition-all"
                      placeholder="Dán tin nhắn hoặc chọn ảnh ghi lô đề..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                    
                    <div className="flex items-center gap-2">
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef}
                        className="hidden" 
                        onChange={handleImageUpload}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl border border-indigo-200 transition-colors text-xs font-bold"
                      >
                        <ImagePlus size={16} />
                        CHỌN ẢNH NẠP
                      </button>
                    </div>

                    {selectedImage && (
                      <div className="relative mt-2 p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <img src={`data:${selectedImage.mime};base64,${selectedImage.base64}`} alt="preview" className="h-10 w-10 object-cover rounded-lg border border-slate-200" />
                          <span className="text-xs font-semibold text-slate-600 truncate">Ảnh đã chọn</span>
                        </div>
                        <button 
                          onClick={() => setSelectedImage(null)}
                          className="p-1 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (!inputText.trim() && !selectedImage)}
                    className="w-20 md:w-24 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl shadow-[0_4px_10px_rgba(79,70,229,0.2)] flex flex-col justify-center items-center gap-2 transition-all active:scale-[0.97]"
                  >
                    {isAnalyzing ? (
                      <Loader2 size={24} className="animate-spin text-white flex-shrink-0" />
                    ) : (
                      <Sparkles size={24} className="text-white flex-shrink-0" />
                    )}
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-center leading-tight px-1">PHÂN TÍCH</span>
                  </button>
                </div>

                {/* AI Result Preview snippet */}
                {aiResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4"
                  >
                    <div className="flex gap-2 mb-2 items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                      <Users size={14} className="text-emerald-500" />
                      <span>{aiResult.danh_sach?.length || 0} người chơi</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
                      {(aiResult.danh_sach || []).map((khach, idx) => (
                        <div key={idx} className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-emerald-800">Khách: {khach.khach_hang}</span>
                            <span className="text-sm font-mono font-bold text-emerald-700">{new Intl.NumberFormat('vi-VN').format(khach.tong_tien_xac || 0)}đ</span>
                          </div>
                          <div className="text-[11px] text-emerald-600/80 uppercase tracking-widest font-semibold flex flex-wrap gap-1">
                            {khach.chi_tiet?.length || 0} mã cược
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </section>

              {/* Calculation Result */}
              {calcResult && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-indigo-900 border border-indigo-700 rounded-2xl p-4 md:p-5 text-white shadow-xl"
                >
                  <div className="flex justify-between items-center border-b border-indigo-700 pb-3 mb-4">
                    <span className="text-xs md:text-sm font-black uppercase tracking-widest text-indigo-300">Báo cáo kết quả</span>
                    <span className="bg-indigo-500 px-2 py-0.5 md:py-1 rounded-md text-[10px] md:text-xs font-bold uppercase">Tổng {calcResult.danh_sach?.length || 0} KQ</span>
                  </div>

                  <div className="space-y-4 mb-5 max-h-[50vh] md:max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                    {(calcResult.danh_sach || []).map((khach: any, kIdx: number) => {
                       const copyText = `Khách: ${khach.khach_hang}\n${(khach.chi_tiet_ket_qua || []).map((w: any) => `- ${w.loai} ${w.so}: ${w.isWin ? 'Trúng' + (w.nhay ? ` (${w.nhay} nháy)` : '') + ' +' + new Intl.NumberFormat('vi-VN').format(w.tien_thang) + 'đ' : 'Trượt'}`).join('\n')}\nTổng tiền xác: ${new Intl.NumberFormat('vi-VN').format(khach.tong_tien_xac || 0)}đ\nTổng thắng: ${new Intl.NumberFormat('vi-VN').format(khach.tong_tien_thang || 0)}đ\nLợi nhuận: ${new Intl.NumberFormat('vi-VN').format(khach.loi_nhuan || 0)}đ`;
                       const isExpanded = !!expandedKhach[kIdx];
                       return (
                        <div key={kIdx} className="bg-indigo-950/50 rounded-xl border border-indigo-800/80 group overflow-hidden">
                          <div 
                            className="flex justify-between items-center p-3 cursor-pointer hover:bg-indigo-900/30 transition-colors"
                            onClick={() => setExpandedKhach(prev => ({ ...prev, [kIdx]: !prev[kIdx] }))}
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp size={16} className="text-indigo-400" /> : <ChevronDown size={16} className="text-indigo-400" />}
                              <div className="font-bold text-sm text-indigo-200">{khach.khach_hang}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(copyText);
                                  alert('Đã copy kết quả của ' + khach.khach_hang);
                                }}
                                className="text-xs font-bold px-2 py-0.5 rounded border border-indigo-600 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                              >
                                COPY
                              </button>
                              <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${khach.loi_nhuan >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {khach.loi_nhuan >= 0 ? '+' : ''}{new Intl.NumberFormat('vi-VN').format(khach.loi_nhuan)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Details */}
                          {isExpanded && (
                            <div className="space-y-1 p-3 pt-0 border-t border-indigo-800/50 mt-1">
                              {khach.chi_tiet_ket_qua?.length > 0 ? (
                                khach.chi_tiet_ket_qua.map((win: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center text-xs md:text-sm">
                                    <span className={win.isWin ? "text-indigo-300" : "text-indigo-300/40 line-through decoration-indigo-300/40"}>
                                      {win.loai} <span className={win.isWin ? "text-white font-bold" : "font-semibold"}>{win.so}</span> 
                                      {win.nhay ? ` (${win.nhay} nháy)` : ''}
                                    </span>
                                    {win.isWin ? (
                                      <motion.span 
                                        initial={{ scale: 0.5, opacity: 0, y: 10 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 10, delay: idx * 0.05 }}
                                        className="text-green-400 font-mono font-bold"
                                      >
                                        +{new Intl.NumberFormat('vi-VN').format(win.tien_thang)}
                                      </motion.span>
                                    ) : (
                                      <span className="text-slate-500 font-mono text-[11px] uppercase tracking-wider">Trượt</span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="text-indigo-400/50 text-[11px] italic">Không có mã cược nào</div>
                              )}
                            </div>
                          )}
                        </div>
                       );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-indigo-700/50">
                    <div className="bg-indigo-800/50 p-3 rounded-xl border border-indigo-700/30">
                      <span className="block text-[10px] md:text-xs uppercase font-bold text-indigo-400 mb-1">Tổng Thắng</span>
                      <span className="text-base md:text-lg font-mono font-bold text-green-400">{new Intl.NumberFormat('vi-VN').format(calcResult.tong_tien_thang)}</span>
                    </div>
                    <div className={`p-3 rounded-xl border ${calcResult.loi_nhuan >= 0 ? 'bg-emerald-900/40 border-emerald-800/30' : 'bg-red-900/40 border-red-800/30'}`}>
                      <span className="block text-[10px] md:text-xs uppercase font-bold opacity-70 mb-1">Tổng Lợi Nhuận</span>
                      <span className={`text-base md:text-lg font-mono font-bold ${calcResult.loi_nhuan >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {new Intl.NumberFormat('vi-VN').format(calcResult.loi_nhuan)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </main>

        {/* Footer Actions - Fixed Bottom */}
        <footer className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 md:py-5 md:px-8 bg-white/90 backdrop-blur-md border-t border-slate-200 flex gap-2.5 sm:gap-3 md:gap-4 shadow-[0_-4px_25px_rgba(0,0,0,0.05)] z-20">
          <button 
            onClick={handleClear}
            className="flex flex-col md:flex-row items-center justify-center p-2 sm:p-3 md:p-4 w-20 sm:w-24 md:w-32 min-h-[44px] flex-shrink-0 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100"
          >
            <Trash2 size={20} className="mb-0.5 sm:mb-1 md:mb-0 md:mr-2" />
            <span className="text-[9px] sm:text-[10px] md:text-sm font-bold uppercase tracking-tighter md:tracking-wide">Xóa Info</span>
          </button>
          
          <button 
            onClick={handleCalculate}
            className="flex-grow flex items-center justify-center gap-1.5 sm:gap-2 bg-slate-900 text-white min-h-[44px] rounded-xl shadow-lg hover:bg-slate-800 transition-transform active:scale-[0.99] md:py-4"
          >
            <Calculator size={20} className="text-indigo-400 sm:w-5 sm:h-5 md:w-6 md:h-6" />
            <span className="font-bold tracking-wide uppercase text-[11px] sm:text-xs md:text-base">Tính toán thông minh</span>
          </button>
        </footer>

      </div>
    </div>
  );
}



