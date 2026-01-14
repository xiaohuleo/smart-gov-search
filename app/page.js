// app/page.js
"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import { Search, Upload, Settings, Building2, User, Star, MapPin, Smartphone, Server, Clock, Lightbulb, Briefcase, Zap } from "lucide-react";

export default function Home() {
  // --- 状态管理 ---
  const [csvData, setCsvData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [intent, setIntent] = useState(null);
  const [searchTime, setSearchTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // --- 配置管理 ---
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.groq.com/openai/v1");
  const [apiModel, setApiModel] = useState("llama3-70b-8192");
  
  const [userRole, setUserRole] = useState("自然人");
  const [userCity, setUserCity] = useState("湖南省");
  const [userChannel, setUserChannel] = useState("Android");
  const [enableSatisfaction, setEnableSatisfaction] = useState(false);

  // --- 持久化 ---
  useEffect(() => {
    const savedKey = localStorage.getItem("gov_search_apikey");
    const savedUrl = localStorage.getItem("gov_search_url");
    const savedModel = localStorage.getItem("gov_search_model");
    if (savedKey) setApiKey(savedKey);
    if (savedUrl) setApiBaseUrl(savedUrl);
    if (savedModel) setApiModel(savedModel);
  }, []);

  const handleConfigChange = (key, value, setter) => {
    setter(value);
    localStorage.setItem(key, value);
  };

  // --- 核心：政务全领域知识图谱 (地毯式覆盖) ---
  const GOV_KNOWLEDGE_GRAPH = {
    // 【就业/工作 - 极速映射版】
    // 只要沾边“找工作”，把所有可能的公文词汇全部加上
    "找工作": ["就业", "招聘", "求职", "人才", "岗位", "职业", "失业", "见习", "培训", "档案", "人社", "劳务", "补贴", "工伤", "技能"],
    "工作": ["就业", "职业", "岗位", "单位"],
    "招人": ["招聘", "用工", "人才引进"],
    "失业": ["就业困难", "失业登记", "失业金", "就业援助"],
    "毕业": ["高校毕业生", "报到", "档案", "学位", "学历"],
    "打工": ["务工", "农民工", "劳务"],
    
    // 【证照/状态】
    "过期": ["到期", "换领", "有效期", "失效", "延续"],
    "搞丢": ["遗失", "补领", "挂失", "补办"],
    "丢了": ["遗失", "补领"],
    "不见": ["遗失", "补领"],
    
    // 【生活高频】
    "生娃": ["生育", "出生", "落户", "计生", "准生"],
    "开店": ["经营许可", "营业执照", "设立登记", "个体"],
    "买房": ["不动产", "购房", "公积金", "预售"],
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => setCsvData(results.data),
    });
  };

  // --- 搜索逻辑 ---
  const handleSearch = async () => {
    if (!query || csvData.length === 0) return;
    setLoading(true);
    setResults([]);
    setIntent(null);
    const startTime = performance.now();

    try {
      let finalKeywords = new Set();
      let debugSource = {}; 

      // 1. 清洗 (保留核心词)
      // "我想找工作" -> "找工作"
      const cleanQuery = query.replace(/我要|想|办理|查询|怎么|办|申请|在哪里|弄|去哪|搞|了|的|是/g, "");
      if (cleanQuery) finalKeywords.add(cleanQuery);
      finalKeywords.add(query);

      // 2. 知识库映射 (暴力扩展)
      // 遍历图谱，只要 Query 包含 Key，就把 Value 全部加进去
      Object.keys(GOV_KNOWLEDGE_GRAPH).forEach(key => {
        if (query.includes(key) || (cleanQuery && cleanQuery.includes(key))) {
            GOV_KNOWLEDGE_GRAPH[key].forEach(word => {
                finalKeywords.add(word);
                debugSource[word] = "知识库";
            });
        }
      });

      // 3. AI 补充
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
                    if (!debugSource[k]) debugSource[k] = "AI推理";
                });
                aiTarget = data.target || "all";
            }
        } catch (e) {
            console.warn("AI skipped");
        }
      }

      const keywordArray = Array.from(finalKeywords);
      
      setIntent({
        keywords: keywordArray,
        target: aiTarget,
        sourceMap: debugSource
      });

      // 4. 评分
      const scoredResults = csvData.map((item) => {
        let score = 0;
        let matchReasons = [];
        let matchedKeywords = [];

        const itemName = item["事项名称"] || "";
        const itemShort = item["事项简称"] || "";
        const textToSearch = `${itemName} ${itemShort} ${item["事项标签"]||""}`;

        keywordArray.forEach((kw) => {
          if (!kw || kw.length < 1) return;
          
          if (textToSearch.includes(kw)) {
            matchedKeywords.push(kw);
            let currentScore = 100;
            
            // 核心业务词加权
            if (["就业", "招聘", "人才", "失业", "职业"].includes(kw)) currentScore += 150;
            if (["遗失", "补领", "换领"].includes(kw)) currentScore += 200;

            score += currentScore;
            
            if (!query.includes(kw)) {
                matchReasons.push(`${debugSource[kw] || "扩展"}: ${kw}`);
            }
          }
        });

        if (score === 0) return { item, score: -1, matchReasons };

        // 场景命中逻辑 (Intent Matching)
        // 只要命中了任何一个与"找工作"强相关的词，就认为是好结果
        const isJobRelated = matchedKeywords.some(k => ["就业", "招聘", "求职", "人才", "职业", "失业"].includes(k));
        const isIdCard = matchedKeywords.some(k => k.includes("身份证") && ["换领", "补领"].includes(k));
        
        if (isJobRelated || isIdCard) {
            score += 300;
            matchReasons.unshift("🎯 意图命中");
        }

        // 过滤
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
      alert("Error");
    } finally {
      setSearchTime((performance.now() - startTime).toFixed(0));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
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

      {showSettings && (
        <div className="bg-white p-4 shadow-lg mb-4 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 border-b">
           <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-700 border-b pb-2 mb-2">
                    <Server className="w-4 h-4 text-blue-600" /> API 接入配置
                </div>
                <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-1">API Endpoint</label>
                    <input type="text" value={apiBaseUrl} onChange={(e) => handleConfigChange("gov_search_url", e.target.value, setApiBaseUrl)} className="w-full border p-2 rounded text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[11px] font-medium text-gray-500 block mb-1">API Key</label><input type="password" value={apiKey} onChange={(e) => handleConfigChange("gov_search_apikey", e.target.value, setApiKey)} className="w-full border p-2 rounded text-xs" /></div>
                    <div><label className="text-[11px] font-medium text-gray-500 block mb-1">Model Name</label><input type="text" value={apiModel} onChange={(e) => handleConfigChange("gov_search_model", e.target.value, setApiModel)} className="w-full border p-2 rounded text-xs" /></div>
                </div>
            </div>
            <div>
                 <label className="text-xs font-bold block mb-1">政务数据导入</label>
                 <div className="relative border border-dashed border-gray-300 rounded-lg p-3 bg-blue-50 text-center cursor-pointer">
                     <input type="file" accept=".csv" onChange={handleFileUpload} className="opacity-0 absolute inset-0 w-full h-full" />
                     <span className="text-sm text-blue-600 font-medium flex justify-center gap-2"><Upload className="w-4 h-4" /> {csvData.length > 0 ? `已加载 ${csvData.length} 条` : "导入 CSV"}</span>
                 </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
                <select className="border p-2 rounded text-sm" value={userRole} onChange={(e) => setUserRole(e.target.value)}><option value="自然人">自然人</option><option value="法人">法人</option></select>
                <select className="border p-2 rounded text-sm" value={userCity} onChange={(e) => setUserCity(e.target.value)}>{["湖南省","长沙市","株洲市","湘潭市","衡阳市","邵阳市","岳阳市","常德市","张家界市","益阳市","郴州市","永州市","怀化市","娄底市","湘西土家族苗族自治州"].map(c=><option key={c} value={c}>{c}</option>)}</select>
                <select className="col-span-2 border p-2 rounded text-sm" value={userChannel} onChange={(e) => setUserChannel(e.target.value)}>{["Android","iOS","HarmonyOS","微信小程序","支付宝小程序"].map(c=><option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t"><input type="checkbox" id="satSwitch" checked={enableSatisfaction} onChange={(e) => setEnableSatisfaction(e.target.checked)} /><label htmlFor="satSwitch" className="text-sm">启用“满意度”加权</label></div>
          </div>
        </div>
      )}

      <div className="p-4 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800">{userRole === "自然人" ? "您想办理什么业务？" : "企业服务搜索"}</h2>
            <div className="flex gap-2">
                <input type="text" placeholder="例如：我想找工作" className="flex-1 pl-4 pr-4 py-3 bg-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={loading || csvData.length === 0} className="bg-blue-600 text-white px-5 rounded-xl font-medium">{loading ? "..." : "搜索"}</button>
            </div>
            {csvData.length === 0 && <p className="text-xs text-red-500 mt-2 text-center">⚠️ 请导入数据</p>}
        </div>

        {(intent || results.length > 0) && (
            <div className="mb-4 px-2">
                <div className="flex justify-between items-center mb-2 text-[10px] text-gray-400">
                     <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {searchTime}ms | {results.length} 条结果</span>
                </div>
                {intent && (
                    <div className="flex flex-wrap gap-1.5">
                        {intent.keywords.map((k, i) => {
                            const source = intent.sourceMap?.[k];
                            const isLocal = source === "知识库";
                            const isAI = source === "AI推理";
                            return (
                                <span key={i} className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${query.includes(k) ? 'bg-gray-100' : (isLocal ? 'bg-orange-50 text-orange-600 border-orange-100' : (isAI ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-green-50 text-green-600'))}`}>
                                    {(!query.includes(k)) && (isLocal ? <Briefcase className="w-3 h-3"/> : <Zap className="w-3 h-3"/>)}
                                    {k}
                                </span>
                            )
                        })}
                    </div>
                )}
            </div>
        )}

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
                                <span key={rid} className={`px-1 rounded ${reason.includes("命中") ? 'bg-blue-100 text-blue-700 font-bold' : (reason.includes("知识") ? 'bg-orange-100 text-orange-700' : 'bg-gray-100')}`}>{reason}</span>
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
