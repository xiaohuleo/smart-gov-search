// app/page.js
"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Search, Upload, Settings, Building2, User, Star, MapPin, Smartphone, Server, Clock } from "lucide-react";

export default function Home() {
  // --- 状态管理 ---
  const [csvData, setCsvData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [intent, setIntent] = useState(null);
  const [searchTime, setSearchTime] = useState(0); // 新增：搜索耗时

  // --- 模拟用户上下文 & API配置 ---
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.groq.com/openai/v1");
  const [apiModel, setApiModel] = useState("llama3-70b-8192");
  
  const [userRole, setUserRole] = useState("自然人");
  const [userCity, setUserCity] = useState("湖南省");
  const [userChannel, setUserChannel] = useState("Android");
  const [enableSatisfaction, setEnableSatisfaction] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // --- 处理 CSV 上传 ---
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("CSV Loaded:", results.data.length, "rows");
        setCsvData(results.data);
      },
    });
  };

  // --- 核心搜索逻辑 ---
  const handleSearch = async () => {
    if (!query || csvData.length === 0) return;
    setLoading(true);
    setResults([]);
    setIntent(null);
    const startTime = performance.now(); // 开始计时

    try {
      // 1. 本地预处理：去除常见动词，作为兜底关键词
      // 这样即使 AI 挂了，搜“我要办健康证”也能提取出“健康证”
      const cleanQuery = query.replace(/我要|办理|查询|怎么|办|申请|在哪里|弄|去哪/g, "");
      
      // 2. 调用 AI 获取意图
      let currentIntent = { keywords: [cleanQuery || query], target: "all", action: "all" };
      
      if (apiKey) {
        try {
            const res = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, apiKey, baseUrl: apiBaseUrl, model: apiModel }),
            });
            const data = await res.json();
            if (!data.isFallback && data.keywords) {
                currentIntent = data;
            }
        } catch (e) {
            console.warn("AI Analysis failed, utilizing local fallback");
        }
      }

      // 确保本地清洗过的词也在关键词列表里
      if (cleanQuery && !currentIntent.keywords.includes(cleanQuery)) {
          currentIntent.keywords.push(cleanQuery);
      }
      // 确保原始词也在，以防万一
      if (!currentIntent.keywords.includes(query)) {
          currentIntent.keywords.push(query);
      }

      setIntent(currentIntent);

      // 3. 本地评分与排序算法
      const scoredResults = csvData.map((item) => {
        let score = 0;
        let matchReasons = [];

        // 数据字段映射
        const itemName = item["事项名称"] || "";
        const itemShort = item["事项简称"] || "";
        const itemTags = item["事项标签"] || "";
        const itemTarget = item["服务对象"] || "";
        const itemUnit = item["所属市州单位"] || "";
        const itemChannel = item["发布渠道"] || "";

        // A. 文本匹配 (核心修复：双向匹配)
        // 之前的逻辑是 Item 包含 Keyword。现在增加：如果 Keyword 很长且包含 Item，也算命中。
        const textToSearch = `${itemName} ${itemShort} ${itemTags}`;
        
        currentIntent.keywords.forEach((kw) => {
          if (!kw) return;
          // 情况1：事项名称里包含关键词 (例：事项="从业人员健康证明", 关键词="健康")
          if (textToSearch.includes(kw)) {
            score += 100;
            // 完全相等加分
            if (itemName === kw) score += 50;
          } 
          // 情况2：关键词包含事项名称 (例：事项="健康证", 关键词="我要办健康证")
          // 注意：这需要防止关键词太短导致误判，所以限制kw长度
          else if (kw.length > 2 && kw.includes(itemName)) {
             score += 80;
          }
        });

        if (score === 0) return { item, score: -1, matchReasons };

        // B. 角色匹配
        if (itemTarget && itemTarget.includes(userRole)) {
            score += 30;
            matchReasons.push(`角色相符`);
        } else if (itemTarget && !itemTarget.includes(userRole) && !itemTarget.includes("全部")) {
            score -= 50; 
        }

        // C. 地域匹配
        if (itemUnit) {
            if (itemUnit.includes(userCity)) {
                score += 50; 
                matchReasons.push(`本地: ${userCity}`);
            } else if (userCity !== "湖南省" && itemUnit.includes("湖南省")) {
                score += 20; 
            } else if (userCity === "湖南省" && itemUnit.includes("湖南省")) {
                score += 40; 
            }
        }

        // D. 渠道匹配
        if (itemChannel && !itemChannel.includes(userChannel) && !itemChannel.includes("全部")) {
            score = -1; 
        }

        // E. 满意度/高频
        if (enableSatisfaction && item["满意度"]) {
            score += (parseFloat(item["满意度"]) || 0) * 0.5;
        }
        if (item["是否高频事项"] === "是") {
            score += 15;
            matchReasons.push("高频");
        }

        return { item, score, matchReasons };
      });

      // 4. 过滤并排序
      const finalResults = scoredResults
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ ...r.item, _debugReasons: r.matchReasons }));

      setResults(finalResults.slice(0, 20));

    } catch (err) {
      console.error(err);
      alert("搜索出错");
    } finally {
      const endTime = performance.now();
      setSearchTime((endTime - startTime).toFixed(0)); // 计算耗时(毫秒)
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

      {/* 设置面板 */}
      {showSettings && (
        <div className="bg-white p-4 shadow-lg mb-4 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 border-b">
          <h3 className="font-bold mb-3 text-sm text-gray-500 uppercase border-b pb-2">环境与模型配置</h3>
          
          <div className="space-y-4">
            {/* 1. API 配置区域 */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <div className="flex items-center gap-1 text-xs font-bold text-gray-700">
                    <Server className="w-3 h-3" /> 模型服务配置
                </div>
                
                <div>
                    <label className="text-[10px] text-gray-500 block mb-1">API 地址 (Base URL)</label>
                    <input 
                        type="text" 
                        value={apiBaseUrl}
                        onChange={(e) => setApiBaseUrl(e.target.value)}
                        placeholder="例如: https://api.groq.com/openai/v1"
                        className="w-full border p-1.5 rounded text-xs bg-white"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-gray-500 block mb-1">API Key</label>
                        <input 
                            type="password" 
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full border p-1.5 rounded text-xs bg-white"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-500 block mb-1">模型名称 (Model)</label>
                        <input 
                            type="text" 
                            value={apiModel}
                            onChange={(e) => setApiModel(e.target.value)}
                            placeholder="例如: llama3-8b-8192"
                            className="w-full border p-1.5 rounded text-xs bg-white"
                        />
                    </div>
                </div>
            </div>

            {/* 2. 数据导入 */}
            <div>
              <label className="text-xs font-bold block mb-1">政务数据源 (CSV)</label>
              <div className="relative border border-dashed border-gray-300 rounded-lg p-3 bg-blue-50 text-center hover:bg-blue-100 transition cursor-pointer">
                 <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleFileUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <div className="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium">
                    <Upload className="w-4 h-4" />
                    {csvData.length > 0 ? `已加载 ${csvData.length} 条事项` : "点击导入 CSV 文件"}
                 </div>
              </div>
            </div>

            {/* 3. 用户画像模拟 */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold block mb-1">用户角色</label>
                    <div className="relative">
                        <User className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                        <select className="w-full border p-2 pl-7 rounded text-sm bg-white" value={userRole} onChange={(e) => setUserRole(e.target.value)}>
                            <option value="自然人">自然人 (个人)</option>
                            <option value="法人">法人 (企业)</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold block mb-1">定位区域</label>
                    <div className="relative">
                        <MapPin className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                        <select className="w-full border p-2 pl-7 rounded text-sm bg-white" value={userCity} onChange={(e) => setUserCity(e.target.value)}>
                            <option value="湖南省">湖南省 (本级)</option>
                            <option value="长沙市">长沙市</option>
                            <option value="株洲市">株洲市</option>
                            <option value="湘潭市">湘潭市</option>
                            <option value="衡阳市">衡阳市</option>
                            <option value="邵阳市">邵阳市</option>
                            <option value="岳阳市">岳阳市</option>
                            <option value="常德市">常德市</option>
                            <option value="张家界市">张家界市</option>
                            <option value="益阳市">益阳市</option>
                            <option value="郴州市">郴州市</option>
                            <option value="永州市">永州市</option>
                            <option value="怀化市">怀化市</option>
                            <option value="娄底市">娄底市</option>
                            <option value="湘西土家族苗族自治州">湘西自治州</option>
                        </select>
                    </div>
                </div>
                 <div className="col-span-2">
                    <label className="text-xs font-bold block mb-1">当前终端</label>
                    <div className="relative">
                        <Smartphone className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                        <select className="w-full border p-2 pl-7 rounded text-sm bg-white" value={userChannel} onChange={(e) => setUserChannel(e.target.value)}>
                            <option value="Android">Android App</option>
                            <option value="iOS">iOS App</option>
                            <option value="HarmonyOS">HarmonyOS (鸿蒙)</option>
                            <option value="微信小程序">微信小程序</option>
                            <option value="支付宝小程序">支付宝小程序</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <input 
                    type="checkbox" 
                    id="satSwitch"
                    checked={enableSatisfaction}
                    onChange={(e) => setEnableSatisfaction(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="satSwitch" className="text-sm">启用“满意度”数据加权</label>
            </div>
          </div>
        </div>
      )}

      {/* 搜索区域 */}
      <div className="p-4 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800">
                {userRole === "自然人" ? "您想办理什么业务？" : "企业服务一站式搜索"}
            </h2>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="例如：我要办健康证"
                        className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                </div>
                <button 
                    onClick={handleSearch}
                    disabled={loading || csvData.length === 0}
                    className="bg-blue-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300 whitespace-nowrap"
                >
                    {loading ? "..." : "搜索"}
                </button>
            </div>
            {csvData.length === 0 && (
                <p className="text-xs text-red-500 mt-2 text-center bg-red-50 py-1 rounded">
                    ⚠️ 请先点击右上角 ⚙️ 设置图标导入数据
                </p>
            )}
        </div>

        {/* 意图识别结果 & 统计展示 */}
        {(intent || results.length > 0) && (
            <div className="mb-4 px-2 animate-in fade-in slide-in-from-bottom-2">
                
                {/* 耗时与结果统计 */}
                <div className="flex justify-between items-center mb-2">
                     <div className="flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>耗时 {searchTime}ms</span>
                        <span className="mx-1">|</span>
                        <span>找到 {results.length} 条服务</span>
                     </div>
                     {intent && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                            {intent.target === "all" ? "全对象" : intent.target}
                        </span>
                     )}
                </div>

                {/* 关键词展示 */}
                {intent && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {intent.keywords.map((k, i) => (
                            <span key={i} className={`text-xs px-2 py-1 rounded-full border ${k === query ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                {k}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* 结果列表 */}
        <div className="space-y-3">
            {results.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-800 text-lg leading-tight flex-1">
                            {item["事项名称"]}
                        </h3>
                        <div className="flex flex-col items-end gap-1 ml-2">
                           {item["是否高频事项"] === "是" && (
                               <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                                   高频
                               </span>
                           )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-xs">
                            <User className="w-3 h-3" />
                            {item["服务对象"] || "通用"}
                        </span>
                        
                        <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs">
                            <Building2 className="w-3 h-3" />
                            {item["所属市州单位"] || "省直"}
                        </span>

                        {item["满意度"] && enableSatisfaction && (
                            <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded text-xs">
                                <Star className="w-3 h-3" />
                                {item["满意度"]}
                            </span>
                        )}
                    </div>

                    {item._debugReasons && item._debugReasons.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-50 text-[10px] text-gray-400 flex flex-wrap gap-1">
                            {item._debugReasons.map((reason, rid) => (
                                <span key={rid} className="bg-gray-100 px-1 rounded">{reason}</span>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {results.length === 0 && !loading && intent && (
                <div className="text-center text-gray-400 py-10">
                    <p>未找到服务，请尝试切换角色或定位</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
