"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import { Search, Settings, Upload, CheckCircle2, AlertCircle, Building2, User, Phone, MapPin, FileText } from "lucide-react";
import { DEFAULT_DATA } from "./lib/data"; // 引入内置的庞大数据

export default function Home() {
  const [csvData, setCsvData] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [intentAnalysis, setIntentAnalysis] = useState(null);
  
  // 默认上下文
  const [userContext, setUserContext] = useState({
    role: "all",
    location: "all",
    channel: "Android", 
    useSatisfaction: false, 
  });

  const [apiConfig, setApiConfig] = useState({
    apiKey: "",
    baseUrl: "", 
    model: "llama3-70b-8192"
  });
  const [showConfig, setShowConfig] = useState(false);

  // 初始化加载内置数据
  useEffect(() => {
    setCsvData(DEFAULT_DATA);
  }, []);

  // 核心搜索逻辑优化
  const handleSearch = async (e) => {
    e.preventDefault();
    const query = e.target.search.value;
    if (!query || !apiConfig.apiKey) {
      alert("请输入搜索内容并配置 API Key");
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setIntentAnalysis(null);

    try {
      // 1. 获取 AI 意图
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          apiKey: apiConfig.apiKey,
          customBaseUrl: apiConfig.baseUrl,
          customModel: apiConfig.model
        }),
      });
      
      if (!res.ok) throw new Error((await res.json()).error);
      const intent = await res.json();
      setIntentAnalysis(intent);

      // 2. 智能排序算法
      const results = csvData.map(item => {
        let score = 0;
        let reasons = [];
        const itemName = item["事项名称"] || "";
        const itemLoc = item["所属市州单位"] || "";

        // --- 关键词匹配 (最高优先级) ---
        // 只要匹配到一个关键词，就大幅加分
        let keywordMatched = false;
        if (intent.keywords && Array.isArray(intent.keywords)) {
            intent.keywords.forEach(kw => {
                if (itemName.includes(kw)) {
                    score += 10;
                    keywordMatched = true;
                }
            });
            if (keywordMatched) reasons.push("关键词匹配");
        }
        
        // 原始查询词匹配
        if (itemName.includes(query)) {
            score += 15;
            reasons.push("精确匹配");
        }

        // --- 过滤逻辑 (Filter) ---
        
        // 1. 角色过滤
        const targetRole = userContext.role !== "all" ? userContext.role : intent.role;
        if (targetRole && targetRole !== "null" && targetRole !== "all") {
             // 如果事项明确是另一角色的，扣分或排除
             if (targetRole === "法人" && item["服务对象"] === "自然人") return { ...item, score: -100 };
             if (targetRole === "自然人" && item["服务对象"] === "法人") return { ...item, score: -100 };
        }

        // 2. 关键：地域匹配 (Location Handling)
        // 逻辑：如果用户想要“怀化”的服务，那么“怀化XX”加分，“长沙XX”扣分
        const targetLoc = userContext.location !== "all" ? userContext.location : intent.location;
        
        if (targetLoc && targetLoc !== "null" && targetLoc !== "all") {
            // 用户指定了地点
            if (itemName.includes(targetLoc) || itemLoc.includes(targetLoc)) {
                score += 20; // 强匹配地点
                reasons.push(`匹配地区: ${targetLoc}`);
            } else if (itemLoc !== "全省通用" && !itemLoc.includes(targetLoc)) {
                // 如果事项是别的城市的（比如用户搜怀化，但这事项是长沙的），大幅扣分
                score -= 50; 
            }
        } else {
            // 用户没指定地点，优先展示“全省通用”或当前选择的地点
            // 这里为了演示，假设不搜地点时，不因地点扣分
        }

        return { ...item, score, matchReasons: reasons };
      })
      .filter(item => item.score > 0) // 只显示正分结果
      .sort((a, b) => b.score - a.score) // 分数从高到低
      .slice(0, 50); // 只取前50条，避免页面太长

      setSearchResults(results);

    } catch (err) {
      alert("搜索出错: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  // CSV 上传处理 (保留功能)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        alert(`已导入 ${results.data.length} 条外部数据`);
      }
    });
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* 标题 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <FileText size={20} />
            </div>
            政务服务智能搜索
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            已内置 {DEFAULT_DATA.length}+ 条真实服务事项 · 支持自然语言语义匹配
          </p>
        </div>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${showConfig ? 'bg-blue-100 text-blue-700' : 'bg-white border hover:bg-slate-50'}`}
        >
          <Settings className="w-4 h-4" />
          API 设置
        </button>
      </div>

      {/* 设置面板 */}
      {showConfig && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 animate-in fade-in slide-in-from-top-2">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
             <Settings className="w-4 h-4"/> 模型配置
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Groq API Key</label>
              <input 
                type="password" 
                value={apiConfig.apiKey}
                onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="gsk_xxxxxxxx..."
              />
            </div>
             <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Model</label>
              <select 
                value={apiConfig.model}
                onChange={e => setApiConfig({...apiConfig, model: e.target.value})}
                className="w-full p-2.5 border rounded-lg text-sm bg-white"
              >
                <option value="llama3-70b-8192">Llama3-70b (推荐)</option>
                <option value="mixtral-8x7b-32768">Mixtral-8x7b</option>
                <option value="gemma-7b-it">Gemma-7b</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            * 您的 Key 仅存储在本地浏览器中，用于调用 Groq 免费 API 进行意图分析。
          </p>
        </div>
      )}

      {/* 模拟环境控制栏 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 角色 */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase">
            <User className="w-3 h-3"/> 用户角色
          </label>
          <select 
            className="w-full text-sm font-medium text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
            value={userContext.role}
            onChange={(e) => setUserContext({...userContext, role: e.target.value})}
          >
            <option value="all">不限 (自动识别)</option>
            <option value="自然人">自然人 (个人)</option>
            <option value="法人">法人 (企业)</option>
          </select>
        </div>

        {/* 地点 */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase">
            <MapPin className="w-3 h-3"/> 当前定位
          </label>
          <select 
            className="w-full text-sm font-medium text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
            value={userContext.location}
            onChange={(e) => setUserContext({...userContext, location: e.target.value})}
          >
            <option value="all">全省范围</option>
            <option value="长沙">长沙市</option>
            <option value="怀化">怀化市</option>
            <option value="株洲">株洲市</option>
            <option value="湘潭">湘潭市</option>
            <option value="衡阳">衡阳市</option>
            <option value="邵阳">邵阳市</option>
            <option value="岳阳">岳阳市</option>
            <option value="常德">常德市</option>
            <option value="张家界">张家界市</option>
            <option value="益阳">益阳市</option>
            <option value="郴州">郴州市</option>
            <option value="永州">永州市</option>
            <option value="娄底">娄底市</option>
            <option value="湘西">湘西州</option>
          </select>
        </div>

        {/* 渠道 */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase">
            <Phone className="w-3 h-3"/> 终端渠道
          </label>
          <select 
            className="w-full text-sm font-medium text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
            value={userContext.channel}
            onChange={(e) => setUserContext({...userContext, channel: e.target.value})}
          >
            <option value="Android">Android App</option>
            <option value="iOS">iOS App</option>
            <option value="WeChat">微信小程序</option>
          </select>
        </div>

        {/* 导入按钮 */}
        <div className="flex justify-end items-center">
             <label className="cursor-pointer flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition">
                <Upload className="w-3 h-3"/>
                导入 CSV
                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload}/>
             </label>
        </div>
      </div>

      {/* 搜索框区域 */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-200 to-indigo-200 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-200"></div>
        <form onSubmit={handleSearch} className="relative bg-white rounded-xl shadow-lg flex items-center p-2">
          <Search className="ml-4 text-slate-400 w-6 h-6 shrink-0" />
          <input
            name="search"
            type="text"
            placeholder="请用自然语言描述您的需求，例如：'想查一下怀化的公积金'..."
            className="w-full p-3 pl-3 text-lg outline-none text-slate-700 placeholder:text-slate-400"
            disabled={isSearching}
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 transition shrink-0"
          >
            {isSearching ? "分析中..." : "搜索"}
          </button>
        </form>
      </div>

      {/* 分析结果调试条 */}
      {intentAnalysis && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex flex-wrap gap-4 text-sm text-indigo-900 items-center animate-in fade-in slide-in-from-top-1">
          <div className="font-bold flex items-center gap-2">
             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"/>
             AI 意图识别:
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-indigo-400 text-xs uppercase font-bold">关键词</span>
            <div className="flex gap-1">
                {intentAnalysis.keywords?.map(k => (
                    <span key={k} className="bg-white px-2 py-0.5 rounded border border-indigo-100 shadow-sm">{k}</span>
                ))}
            </div>
          </div>
          {intentAnalysis.location && intentAnalysis.location !== "null" && (
             <div className="flex gap-2 items-center">
                <span className="text-indigo-400 text-xs uppercase font-bold">地点</span>
                <span className="bg-white px-2 py-0.5 rounded border border-indigo-100 shadow-sm font-medium">{intentAnalysis.location}</span>
             </div>
          )}
        </div>
      )}

      {/* 结果列表 */}
      <div className="space-y-3">
        {searchResults.length > 0 ? (
           searchResults.map((item, idx) => (
            <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 hover:shadow-md hover:border-blue-200 transition group cursor-pointer">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                   <div className="flex items-start justify-between">
                       <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 mb-1">
                         {item["事项名称"]}
                       </h3>
                   </div>
                   
                   <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded text-slate-600">
                        <Building2 className="w-3 h-3"/> {item["所属市州单位"]}
                      </span>
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded text-slate-600">
                        <User className="w-3 h-3"/> {item["服务对象"]}
                      </span>
                      {item.matchReasons?.map((reason, i) => (
                          <span key={i} className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-100">
                              {reason}
                          </span>
                      ))}
                   </div>
                </div>
                
                <div className="flex flex-col items-end shrink-0">
                    <span className="text-xs text-slate-300 font-mono mb-1">{item["事项编码"]}</span>
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                        Go
                    </div>
                </div>
              </div>
            </div>
           ))
        ) : (
          !isSearching && (
            <div className="text-center py-20">
               <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                  <Search className="w-8 h-8 text-slate-300"/>
               </div>
               <h3 className="text-lg font-medium text-slate-600">准备就绪</h3>
               <p className="text-slate-400 mt-2 max-w-sm mx-auto">
                 {intentAnalysis ? "抱歉，没有找到匹配的服务事项。请尝试换个说法或切换城市。" : "请输入上方搜索框开始体验智能政务搜索"}
               </p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
