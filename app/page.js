// app/page.js
"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Search, Upload, Settings, Building2, User, Star, MapPin, Smartphone, Server } from "lucide-react";

export default function Home() {
  // --- 状态管理 ---
  const [csvData, setCsvData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [intent, setIntent] = useState(null);

  // --- 模拟用户上下文 & API配置 ---
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.groq.com/openai/v1"); // 默认 Groq 地址
  const [apiModel, setApiModel] = useState("llama3-70b-8192"); // 默认 Groq 模型
  
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

    try {
      // 1. 调用 AI 获取意图和扩展词
      let currentIntent = { keywords: [query], target: "all", action: "all" };
      
      if (apiKey) {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 将配置的 URL 和 模型 传给后端
          body: JSON.stringify({ query, apiKey, baseUrl: apiBaseUrl, model: apiModel }),
        });
        const data = await res.json();
        if (!data.isFallback) {
            currentIntent = data;
        }
        // 总是把原始搜索词加进去
        if (!currentIntent.keywords.includes(query)) {
            currentIntent.keywords.unshift(query);
        }
      }
      setIntent(currentIntent);

      // 2. 本地评分与排序算法
      const scoredResults = csvData.map((item) => {
        let score = 0;
        let matchReasons = [];

        // 数据字段映射 (容错处理)
        const itemName = item["事项名称"] || "";
        const itemShort = item["事项简称"] || "";
        const itemTags = item["事项标签"] || "";
        const itemTarget = item["服务对象"] || "";
        const itemUnit = item["所属市州单位"] || "";
        const itemChannel = item["发布渠道"] || "";

        // A. 基础文本匹配
        const textToSearch = `${itemName} ${itemShort} ${itemTags}`;
        currentIntent.keywords.forEach((kw) => {
          if (textToSearch.includes(kw)) {
            score += 100;
            if (itemName === kw) score += 50;
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

        // C. 地域匹配 (精确匹配市州)
        if (itemUnit) {
            if (itemUnit.includes(userCity)) {
                score += 50; // 完全匹配当前城市
                matchReasons.push(`本地: ${userCity}`);
            } else if (userCity !== "湖南省" && itemUnit.includes("湖南省")) {
                score += 20; // 即使选了具体城市，省级服务也是能办的，但分低一点
            } else if (userCity === "湖南省" && itemUnit.includes("湖南省")) {
                score += 40; // 选了全省，且服务也是全省
            }
        }

        // D. 渠道匹配
        if (itemChannel && !itemChannel.includes(userChannel) && !itemChannel.includes("全部")) {
            score = -1; // 渠道不支持，直接过滤
        }

        // E. 满意度/高频
        if (enableSatisfaction && item["满意度"]) {
            const sat = parseFloat(item["满意度"]) || 0;
            score += sat * 0.5;
        }
        if (item["是否高频事项"] === "是") {
            score += 15;
            matchReasons.push("高频");
        }

        return { item, score, matchReasons };
      });

      // 3. 过滤并排序
      const finalResults = scoredResults
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ ...r.item, _debugReasons: r.matchReasons }));

      setResults(finalResults.slice(0, 20));

    } catch (err) {
      console.error(err);
      alert("搜索出错，请检查API Key配置或网络");
    } finally {
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

        {/* 意图识别结果展示 */}
        {intent && (
            <div className="mb-4 px-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="text-[10px] text-gray-400 mb-1 flex items-center justify-between">
                    <span>AI 意图识别 ({apiModel})</span>
                    <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                        {intent.target === "all" ? "全对象" : intent.target}
                    </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {intent.keywords.map((k, i) => (
                        <span key={i} className={`text-xs px-2 py-1 rounded-full border ${k === query ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                            {k}
                        </span>
                    ))}
                </div>
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
