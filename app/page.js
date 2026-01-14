// app/page.js
"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Search, Upload, Settings, Building2, User, Star, MapPin, Smartphone, Server, Clock, Lightbulb, CheckCircle2 } from "lucide-react";

export default function Home() {
  // --- 状态管理 ---
  const [csvData, setCsvData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [intent, setIntent] = useState(null);
  const [searchTime, setSearchTime] = useState(0);

  // --- 配置 ---
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.groq.com/openai/v1");
  const [apiModel, setApiModel] = useState("llama3-70b-8192");
  const [userRole, setUserRole] = useState("自然人");
  const [userCity, setUserCity] = useState("湖南省");
  const [userChannel, setUserChannel] = useState("Android");
  const [enableSatisfaction, setEnableSatisfaction] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // --- 核心：本地同义词典 (暴力解决搜不到的问题) ---
  const LOCAL_SYNONYMS = {
    "搞丢": ["遗失", "补领", "挂失", "补办"],
    "丢了": ["遗失", "补领", "挂失"],
    "不见了": ["遗失", "补领"],
    "掉了": ["遗失", "补领"],
    "办证": ["办理", "核发", "注册"],
    "开店": ["经营许可", "设立登记", "营业执照"],
    "生娃": ["生育", "出生", "落户"],
    "生孩子": ["生育", "出生", "落户"],
    "买房": ["不动产", "购房", "公积金"],
    "卖房": ["二手房", "转移登记"],
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => setCsvData(results.data),
    });
  };

  const handleSearch = async () => {
    if (!query || csvData.length === 0) return;
    setLoading(true);
    setResults([]);
    setIntent(null);
    const startTime = performance.now();

    try {
      // 1. 初始化关键词集合 (使用 Set 去重)
      let finalKeywords = new Set();
      let debugSource = {}; // 记录关键词来源

      // A. 原始词清洗
      const cleanQuery = query.replace(/我要|想|办理|查询|怎么|办|申请|在哪里|弄|去哪|搞|了|的|是/g, "");
      if (cleanQuery) finalKeywords.add(cleanQuery);
      finalKeywords.add(query); // 保留原始句

      // B. 本地词典匹配 (这是解决“搞丢”最关键的一步)
      Object.keys(LOCAL_SYNONYMS).forEach(key => {
        if (query.includes(key)) {
            LOCAL_SYNONYMS[key].forEach(word => {
                finalKeywords.add(word);
                debugSource[word] = "本地词典";
            });
        }
      });

      // C. AI 意图识别 (作为补充)
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
            console.warn("AI 失败，使用本地降级策略");
        }
      }

      // 转为数组供后续使用
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

        // 数据字段准备
        const itemName = item["事项名称"] || "";
        const itemShort = item["事项简称"] || "";
        const itemTags = item["事项标签"] || "";
        
        // 拼接全文本用于检索
        const textToSearch = `${itemName} ${itemShort} ${itemTags}`;

        // D. 匹配逻辑 (核心修改)
        keywordArray.forEach((kw) => {
          if (!kw || kw.length < 1) return;
          
          if (textToSearch.includes(kw)) {
            matchedKeywords.push(kw);
            // 基础分
            let currentScore = 100;
            
            // 命中关键术语 (遗失、补领) 加分极高
            if (["遗失", "补领", "挂失"].includes(kw)) currentScore += 200;
            
            // 命中核心名词 (身份证) 加分
            if (kw.includes("身份证") || kw.includes("证")) currentScore += 150;

            score += currentScore;
            
            // 记录匹配原因 (优先显示非原始词)
            if (!query.includes(kw)) {
                matchReasons.push(`${debugSource[kw] || "扩展"}: ${kw}`);
            }
          }
        });

        // 必须命中至少一个关键词，且分数 > 0
        if (score === 0) return { item, score: -1, matchReasons };

        // 惩罚机制：如果搜“身份证”，结果只有“证”，关联度太低，扣分
        // 奖励机制：同时命中“身份证”和“遗失”，分数翻倍
        const hasIdentity = matchedKeywords.some(k => k.includes("身份证") || k.includes("户口"));
        const hasAction = matchedKeywords.some(k => ["遗失", "补领", "挂失", "办理"].includes(k));
        
        if (hasIdentity && hasAction) {
            score += 500; // 完美匹配
            matchReasons.unshift("✨ 完美匹配");
        }

        // 角色/地域/终端过滤 (逻辑保持不变)
        const itemTarget = item["服务对象"] || "";
        const itemUnit = item["所属市州单位"] || "";
        const itemChannel = item["发布渠道"] || "";

        if (itemTarget && itemTarget.includes(userRole)) score += 50;
        else if (itemTarget && !itemTarget.includes(userRole) && !itemTarget.includes("全部")) score -= 100; // 角色不对严厉扣分

        if (itemUnit) {
            if (itemUnit.includes(userCity)) score += 60;
            else if (userCity === "湖南省" && itemUnit.includes("湖南省")) score += 40;
            else if (itemUnit.includes("湖南省")) score += 20;
        }

        if (itemChannel && !itemChannel.includes(userChannel) && !itemChannel.includes("全部")) score = -9999; // 终端不对直接屏蔽
        if (enableSatisfaction && item["满意度"]) score += (parseFloat(item["满意度"]) || 0) * 0.5;

        return { item, score, matchReasons: [...new Set(matchReasons)] }; // 去重原因
      });

      const finalResults = scoredResults
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ ...r.item, _debugReasons: r.matchReasons }));

      setResults(finalResults.slice(0, 20));

    } catch (err) {
      console.error(err);
      alert("搜索发生错误");
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
          <button onClick={() => setShowSettings(!showSettings)}>
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Settings Panel (Keep same layout) */}
      {showSettings && (
        <div className="bg-white p-4 shadow-lg mb-4 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 border-b">
           <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <div className="flex items-center gap-1 text-xs font-bold text-gray-700"><Server className="w-3 h-3" /> API 配置</div>
                <input type="text" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="API URL" className="w-full border p-1.5 rounded text-xs" />
                <div className="grid grid-cols-2 gap-2">
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="w-full border p-1.5 rounded text-xs" />
                    <input type="text" value={apiModel} onChange={(e) => setApiModel(e.target.value)} placeholder="Model" className="w-full border p-1.5 rounded text-xs" />
                </div>
            </div>
            <div className="border border-dashed p-3 rounded-lg text-center bg-blue-50">
                 <input type="file" accept=".csv" onChange={handleFileUpload} className="opacity-0 absolute inset-0 w-full h-full" />
                 <span className="text-sm text-blue-600 font-medium">点击导入 CSV ({csvData.length}条)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <select className="border p-2 rounded text-sm" value={userRole} onChange={(e) => setUserRole(e.target.value)}><option value="自然人">自然人</option><option value="法人">法人</option></select>
                <select className="border p-2 rounded text-sm" value={userCity} onChange={(e) => setUserCity(e.target.value)}>
                    {["湖南省","长沙市","株洲市","湘潭市","衡阳市","邵阳市","岳阳市","常德市","张家界市","益阳市","郴州市","永州市","怀化市","娄底市","湘西土家族苗族自治州"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <select className="col-span-2 border p-2 rounded text-sm" value={userChannel} onChange={(e) => setUserChannel(e.target.value)}>
                    {["Android","iOS","HarmonyOS","微信小程序","支付宝小程序"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
            </div>
          </div>
        </div>
      )}

      {/* Search Area */}
      <div className="p-4 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800">{userRole === "自然人" ? "您想办理什么业务？" : "企业服务搜索"}</h2>
            <div className="flex gap-2">
                <input type="text" placeholder="例如：身份证搞丢了" className="flex-1 pl-4 pr-4 py-3 bg-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={loading||csvData.length===0} className="bg-blue-600 text-white px-5 rounded-xl font-medium whitespace-nowrap">{loading?"...":"搜索"}</button>
            </div>
        </div>

        {/* Info Bar */}
        {(intent || results.length > 0) && (
            <div className="mb-4 px-2">
                <div className="flex justify-between items-center mb-2 text-[10px] text-gray-400">
                     <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {searchTime}ms | {results.length} 条结果</span>
                </div>
                {intent && (
                    <div className="flex flex-wrap gap-1.5">
                        {intent.keywords.map((k, i) => {
                            const source = intent.sourceMap?.[k];
                            const isLocal = source === "本地词典";
                            const isAI = source === "AI联想";
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

        {/* Results */}
        <div className="space-y-3">
            {results.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-800 text-lg leading-tight flex-1">{item["事项名称"]}</h3>
                        {item["是否高频事项"] === "是" && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium ml-2">高频</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-gray-500">
                        <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-xs flex items-center gap-1"><User className="w-3 h-3"/>{item["服务对象"]||"通用"}</span>
                        <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs flex items-center gap-1"><Building2 className="w-3 h-3"/>{item["所属市州单位"]||"省直"}</span>
                        {item["满意度"] && enableSatisfaction && <span className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs flex items-center gap-1"><Star className="w-3 h-3"/>{item["满意度"]}</span>}
                    </div>
                    {item._debugReasons && item._debugReasons.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-50 text-[10px] text-gray-500 flex flex-wrap gap-1">
                            {item._debugReasons.map((reason, rid) => (
                                <span key={rid} className={`px-1 rounded ${reason.includes("完美") ? 'bg-blue-100 text-blue-700 font-bold' : (reason.includes("本地") ? 'bg-orange-100 text-orange-700' : 'bg-gray-100')}`}>{reason}</span>
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
