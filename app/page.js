"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import { Search, Upload, Settings, Building2, User, Star, MapPin, Smartphone, Server, Clock, Lightbulb, Save } from "lucide-react";

export default function Home() {
  // --- 1. 核心数据状态 ---
  const [csvData, setCsvData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [intent, setIntent] = useState(null);
  const [searchTime, setSearchTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // --- 2. 配置状态 (带持久化) ---
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.groq.com/openai/v1");
  const [apiModel, setApiModel] = useState("llama3-70b-8192");
  
  // 用户模拟环境
  const [userRole, setUserRole] = useState("自然人");
  const [userCity, setUserCity] = useState("湖南省");
  const [userChannel, setUserChannel] = useState("Android");
  const [enableSatisfaction, setEnableSatisfaction] = useState(false);

  // --- 3. 生命周期：页面加载时读取缓存 ---
  useEffect(() => {
    // 防止服务端渲染不一致，只在客户端执行
    const loadSettings = () => {
      const savedKey = localStorage.getItem("gov_search_apikey");
      const savedUrl = localStorage.getItem("gov_search_url");
      const savedModel = localStorage.getItem("gov_search_model");
      
      if (savedKey) setApiKey(savedKey);
      if (savedUrl) setApiBaseUrl(savedUrl);
      if (savedModel) setApiModel(savedModel);
    };
    loadSettings();
  }, []);

  // --- 4. 配置修改处理 (同步保存到 localStorage) ---
  const handleConfigChange = (key, value, setter) => {
    setter(value); // 更新页面状态
    localStorage.setItem(key, value); // 保存到浏览器
  };

  // --- 5. 本地同义词典 (强力修正) ---
  const LOCAL_SYNONYMS = {
    "搞丢": ["遗失", "补领", "挂失", "补办"],
    "丢了": ["遗失", "补领", "挂失"],
    "不见": ["遗失", "补领"],
    "掉了": ["遗失", "补领"],
    "办证": ["办理", "核发", "注册"],
    "开店": ["经营许可", "设立登记", "营业执照"],
    "生娃": ["生育", "出生", "落户"],
    "生孩子": ["生育", "出生", "落户"],
    "买房": ["不动产", "购房", "公积金"],
    "卖房": ["二手房", "转移登记"],
  };

  // --- CSV 处理 ---
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => setCsvData(results.data),
    });
  };

  // --- 6. 核心搜索逻辑 ---
  const handleSearch = async () => {
    if (!query || csvData.length === 0) return;
    setLoading(true);
    setResults([]);
    setIntent(null);
    const startTime = performance.now();

    try {
      // 1. 初始化关键词集合
      let finalKeywords = new Set();
      let debugSource = {}; 

      // A. 原始词清洗
      const cleanQuery = query.replace(/我要|想|办理|查询|怎么|办|申请|在哪里|弄|去哪|搞|了|的|是/g, "");
      if (cleanQuery) finalKeywords.add(cleanQuery);
      finalKeywords.add(query);

      // B. 本地词典暴力匹配
      Object.keys(LOCAL_SYNONYMS).forEach(key => {
        if (query.includes(key)) {
            LOCAL_SYNONYMS[key].forEach(word => {
                finalKeywords.add(word);
                debugSource[word] = "本地词典";
            });
        }
      });

      // C. AI 意图识别 (如果配置了Key)
      let aiTarget = "all";
      if (apiKey) {
        try {
            const res = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, apiKey, baseUrl: apiBaseUrl, model: apiModel }),
            });
            const data = await res.json();
            if (!data.isFallback && data.keywords) {
                data.keywords.forEach(k => {
                    finalKeywords.add(k);
                    if (!debugSource[k]) debugSource[k] = "AI联想";
                });
                aiTarget = data.target || "all";
            }
        } catch (e) {
            console.warn("AI 请求失败，仅使用本地逻辑");
        }
      }

      const keywordArray = Array.from(finalKeywords);
      
      setIntent({
        keywords: keywordArray,
        target: aiTarget,
        sourceMap: debugSource
      });

      // 2. 评分排序
      const scoredResults = csvData.map((item) => {
        let score = 0;
        let matchReasons = [];
        let matchedKeywords = [];

        const itemName = item["事项名称"] || "";
        const itemShort = item["事项简称"] || "";
        const itemTags = item["事项标签"] || "";
        const textToSearch = `${itemName} ${itemShort} ${itemTags}`;

        // D. 匹配算分
        keywordArray.forEach((kw) => {
          if (!kw || kw.length < 1) return;
          
          if (textToSearch.includes(kw)) {
            matchedKeywords.push(kw);
            let currentScore = 100;
            
            // 命中关键动词加分
            if (["遗失", "补领", "挂失", "经营许可"].includes(kw)) currentScore += 200;
            // 命中核心名词加分
            if (kw.includes("身份证") || kw.includes("执照")) currentScore += 150;

            score += currentScore;
            
            if (!query.includes(kw)) {
                matchReasons.push(`${debugSource[kw] || "扩展"}: ${kw}`);
            }
          }
        });

        if (score === 0) return { item, score: -1, matchReasons };

        // 组合奖励：同时有"身份证"和"遗失" -> 完美
        const hasIdentity = matchedKeywords.some(k => k.includes("身份证") || k.includes("户口"));
        const hasAction = matchedKeywords.some(k => ["遗失", "补领", "挂失"].includes(k));
        
        if (hasIdentity && hasAction) {
            score += 500;
            matchReasons.unshift("✨ 精准命中");
        }

        // 过滤逻辑
        const itemTarget = item["服务对象"] || "";
        const itemUnit = item["所属市州单位"] || "";
        const itemChannel = item["发布渠道"] || "";

        if (itemTarget && itemTarget.includes(userRole)) score += 50;
        else if (itemTarget && !itemTarget.includes(userRole) && !itemTarget.includes("全部")) score -= 100;

        if (itemUnit) {
            if (itemUnit.includes(userCity)) score += 60;
            else if (userCity === "湖南省" && itemUnit.includes("湖南省")) score += 40;
            else if (itemUnit.includes("湖南省")) score += 20;
        }

        if (itemChannel && !itemChannel.includes(userChannel) && !itemChannel.includes("全部")) score = -9999;
        if (enableSatisfaction && item["满意度"]) score += (parseFloat(item["满意度"]) || 0) * 0.5;

        return { item, score, matchReasons: [...new Set(matchReasons)] };
      });

      const finalResults = scoredResults
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ ...r.item, _debugReasons: r.matchReasons }));

      setResults(finalResults.slice(0, 20));

    } catch (err) {
      console.error(err);
      alert("搜索发生错误，请检查控制台");
    } finally {
      setSearchTime((performance.now() - startTime).toFixed(0));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      {/* 顶部导航 */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            <h1 className="text-lg font-bold">统一搜索</h1>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="hover:bg-blue-700 p-1 rounded transition">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 设置面板 (确保输入框可交互) */}
      {showSettings && (
        <div className="bg-white p-4 shadow-lg mb-4 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 border-b">
           <div className="space-y-4">
            {/* API 配置区 - 使用标准的 onChange 处理 */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-700 border-b pb-2 mb-2">
                    <Server className="w-4 h-4 text-blue-600" /> 
                    API 接入配置 (自动保存)
                </div>
                
                <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-1">API Endpoint (Base URL)</label>
                    <input 
                        type="text" 
                        value={apiBaseUrl}
                        onChange={(e) => handleConfigChange("gov_search_url", e.target.value, setApiBaseUrl)}
                        placeholder="https://api.groq.com/openai/v1" 
                        className="w-full border border-gray-300 p-2 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[11px] font-medium text-gray-500 block mb-1">API Key</label>
                        <input 
                            type="password" 
                            value={apiKey}
                            onChange={(e) => handleConfigChange("gov_search_apikey", e.target.value, setApiKey)}
                            placeholder="sk-..." 
                            className="w-full border border-gray-300 p-2 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                        />
                    </div>
                    <div>
                        <label className="text-[11px] font-medium text-gray-500 block mb-1">Model Name</label>
                        <input 
                            type="text" 
                            value={apiModel}
                            onChange={(e) => handleConfigChange("gov_search_model", e.target.value, setApiModel)}
                            placeholder="llama3-70b-8192" 
                            className="w-full border border-gray-300 p-2 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                        />
                    </div>
                </div>
            </div>

            {/* CSV 导入区 */}
            <div>
                 <label className="text-xs font-bold block mb-1">政务数据导入</label>
                 <div className="relative border border-dashed border-gray-300 rounded-lg p-3 bg-blue-50 text-center hover:bg-blue-100 transition cursor-pointer">
                     <input type="file" accept=".csv" onChange={handleFileUpload} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                     <span className="text-sm text-blue-600 font-medium flex items-center justify-center gap-2">
                        <Upload className="w-4 h-4" /> 
                        {csvData.length > 0 ? `已加载 ${csvData.length} 条数据` : "点击导入 CSV 文件"}
                     </span>
                 </div>
            </div>

            {/* 模拟环境区 */}
            <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                     <label className="text-xs font-bold block mb-1">用户角色</label>
                     <select className="w-full border p-2 rounded text-sm bg-white" value={userRole} onChange={(e) => setUserRole(e.target.value)}>
                        <option value="自然人">自然人</option><option value="法人">法人</option>
                     </select>
                </div>
                <div>
                     <label className="text-xs font-bold block mb-1">当前定位</label>
                     <select className="w-full border p-2 rounded text-sm bg-white" value={userCity} onChange={(e) => setUserCity(e.target.value)}>
                        {["湖南省","长沙市","株洲市","湘潭市","衡阳市","邵阳市","岳阳市","常德市","张家界市","益阳市","郴州市","永州市","怀化市","娄底市","湘西土家族苗族自治州"].map(c=><option key={c} value={c}>{c}</option>)}
                     </select>
                </div>
                <div className="col-span-2">
                     <label className="text-xs font-bold block mb-1">使用终端</label>
                     <select className="w-full border p-2 rounded text-sm bg-white" value={userChannel} onChange={(e) => setUserChannel(e.target.value)}>
                        {["Android","iOS","HarmonyOS","微信小程序","支付宝小程序"].map(c=><option key={c} value={c}>{c}</option>)}
                     </select>
                </div>
            </div>
            
            <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <input type="checkbox" id="satSwitch" checked={enableSatisfaction} onChange={(e) => setEnableSatisfaction(e.target.checked)} className="rounded" />
                <label htmlFor="satSwitch" className="text-sm">启用“满意度”结果加权</label>
            </div>
          </div>
        </div>
      )}

      {/* 搜索框区域 */}
      <div className="p-4 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800">{userRole === "自然人" ? "您想办理什么业务？" : "企业服务一站式搜索"}</h2>
            <div className="flex gap-2">
                <input 
                    type="text" 
                    placeholder="例如：身份证搞丢了" 
                    className="flex-1 pl-4 pr-4 py-3 bg-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    value={query} 
                    onChange={(e) => setQuery(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                />
                <button 
                    onClick={handleSearch} 
                    disabled={loading || csvData.length === 0} 
                    className="bg-blue-600 text-white px-5 rounded-xl font-medium whitespace-nowrap hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                >
                    {loading ? "..." : "搜索"}
                </button>
            </div>
            {csvData.length === 0 && <p className="text-xs text-red-500 mt-2 text-center">⚠️ 请先在设置中导入 CSV 数据</p>}
        </div>

        {/* 搜索结果统计栏 */}
        {(intent || results.length > 0) && (
            <div className="mb-4 px-2">
                <div className="flex justify-between items-center mb-2 text-[10px] text-gray-400">
                     <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {searchTime}ms | {results.length} 条结果</span>
                     {intent && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{intent.target === "all" ? "全对象" : intent.target}</span>}
                </div>
                {intent && (
                    <div className="flex flex-wrap gap-1.5">
                        {intent.keywords.map((k, i) => {
                            const source = intent.sourceMap?.[k];
                            const isLocal = source === "本地词典";
                            // const isAI = source === "AI联想";
                            return (
                                <span key={i} className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${query.includes(k) ? 'bg-gray-100' : (isLocal ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100')}`}>
                                    {(!query.includes(k)) && (isLocal ? <Building2 className="w-3 h-3"/> : <Lightbulb className="w-3 h-3"/>)}
                                    {k}
                                </span>
                            )
                        })}
                    </div>
                )}
            </div>
        )}

        {/* 结果列表 */}
        <div className="space-y-3">
            {results.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-800 text-lg leading-tight flex-1">{item["事项名称"]}</h3>
                        {item["是否高频事项"] === "是" && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium ml-2 whitespace-nowrap">高频</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-gray-500">
                        <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-xs flex items-center gap-1"><User className="w-3 h-3"/>{item["服务对象"]||"通用"}</span>
                        <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs flex items-center gap-1"><Building2 className="w-3 h-3"/>{item["所属市州单位"]||"省直"}</span>
                        {item["满意度"] && enableSatisfaction && <span className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs flex items-center gap-1"><Star className="w-3 h-3"/>{item["满意度"]}</span>}
                    </div>
                    {item._debugReasons && item._debugReasons.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-50 text-[10px] text-gray-500 flex flex-wrap gap-1">
                            {item._debugReasons.map((reason, rid) => (
                                <span key={rid} className={`px-1 rounded ${reason.includes("精准") ? 'bg-blue-100 text-blue-700 font-bold' : (reason.includes("本地") ? 'bg-orange-100 text-orange-700' : 'bg-gray-100')}`}>{reason}</span>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {results.length === 0 && !loading && intent && <div className="text-center text-gray-400 py-10"><p>未找到服务，请尝试切换角色或定位</p></div>}
        </div>
      </div>
    </div>
  );
}
