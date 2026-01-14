// app/page.tsx
"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { Search, Upload, Settings, Building2, User, MapPin, Smartphone, Star, ChevronDown, Check } from "lucide-react";

// --- 类型定义 ---
interface ServiceItem {
  事项名称: string;
  事项简称: string;
  事项编码: string;
  服务对象: string; // 自然人/法人
  所属市州单位: string;
  事项分类: string;
  发布渠道: string; // Web/Android/iOS
  满意度?: string; // 假设 CSV 中有这个字段，0-100
  事项标签?: string;
  是否高频事项?: string;
  [key: string]: any;
}

interface SearchIntent {
  keywords: string[];
  target: "自然人" | "法人" | "all";
  action: string;
  isFallback?: boolean;
}

export default function Home() {
  // --- 状态管理 ---
  const [csvData, setCsvData] = useState<ServiceItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ServiceItem[]>([]);
  const [intent, setIntent] = useState<SearchIntent | null>(null);

  // --- 模拟用户上下文 (Settings) ---
  const [apiKey, setApiKey] = useState("");
  const [userRole, setUserRole] = useState<"自然人" | "法人">("自然人");
  const [userCity, setUserCity] = useState("长沙市"); // 模拟定位
  const [userChannel, setUserChannel] = useState("Android"); // 模拟终端
  const [enableSatisfaction, setEnableSatisfaction] = useState(false); // 满意度排序开关
  const [showSettings, setShowSettings] = useState(false);

  // --- 处理 CSV 上传 ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("CSV Loaded:", results.data.length, "rows");
        setCsvData(results.data as ServiceItem[]);
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
      let currentIntent: SearchIntent = { keywords: [query], target: "all", action: "all" };
      
      if (apiKey) {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, apiKey }),
        });
        const data = await res.json();
        if (!data.isFallback) {
            currentIntent = data;
        }
        // 总是把原始搜索词加进去，防止AI过度发散
        if (!currentIntent.keywords.includes(query)) {
            currentIntent.keywords.unshift(query);
        }
      }
      setIntent(currentIntent);

      // 2. 本地评分与排序算法
      const scoredResults = csvData.map((item) => {
        let score = 0;
        let matchReasons: string[] = [];

        // A. 基础文本匹配 (权重最高)
        const textToSearch = `${item.事项名称} ${item.事项简称 || ""} ${item.事项标签 || ""}`;
        currentIntent.keywords.forEach((kw) => {
          if (textToSearch.includes(kw)) {
            score += 100; // 命中关键词
            // 如果是完全匹配，分数极高
            if (item.事项名称 === kw) score += 50;
          }
        });

        // 如果连关键词都没命中，直接淘汰 (或者给极低分)
        if (score === 0) return { item, score: -1, matchReasons };

        // B. 角色匹配 (Role)
        // 数据中的服务对象通常是 "自然人" 或 "法人"
        if (item.服务对象 && item.服务对象.includes(userRole)) {
            score += 30;
            matchReasons.push(`角色相符: ${userRole}`);
        } else if (item.服务对象 && !item.服务对象.includes(userRole) && !item.服务对象.includes("全部")) {
            // 如果明确不包含当前角色，扣分或降权
            score -= 50; 
        }

        // C. 地域匹配 (Location)
        // 假设 "所属市州单位" 包含城市名，如 "长沙市交通局"
        if (item.所属市州单位 && item.所属市州单位.includes(userCity)) {
            score += 40;
            matchReasons.push(`本地服务: ${userCity}`);
        } else if (item.所属市州单位 && (item.所属市州单位.includes("省") || item.所属市州单位 === "全省")) {
            score += 20; // 省级服务也是相关的，但优先级略低于市级
        }

        // D. 渠道匹配 (Channel)
        // 假设 CSV 有 "发布渠道" 字段，包含 "Android", "Web" 等
        if (item.发布渠道 && !item.发布渠道.includes(userChannel) && !item.发布渠道.includes("全部")) {
            score = -1; // 终端不支持，直接过滤
        }

        // E. 满意度/高频 加权
        if (enableSatisfaction && item.满意度) {
            const sat = parseFloat(item.满意度) || 0;
            score += sat * 0.5; // 满意度加分
        }
        if (item.是否高频事项 === "是") {
            score += 15;
            matchReasons.push("高频服务");
        }

        return { item, score, matchReasons };
      });

      // 3. 过滤并排序
      const finalResults = scoredResults
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ ...r.item, _debugReasons: r.matchReasons })); // 把匹配原因带给前端展示

      setResults(finalResults.slice(0, 20)); // 只显示前20条

    } catch (err) {
      console.error(err);
      alert("搜索出错，请检查API Key或网络");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      {/* 顶部导航 */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <h1 className="text-lg font-bold">粤省事 (智能重构版)</h1>
          <button onClick={() => setShowSettings(!showSettings)}>
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 设置面板 (模拟环境) */}
      {showSettings && (
        <div className="bg-white p-4 shadow-lg mb-4 max-w-md mx-auto animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold mb-3 text-sm text-gray-500 uppercase">模拟用户环境 & 配置</h3>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold block mb-1">Groq API Key (免费申请)</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full border p-2 rounded text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                * 必填，用于意图识别。未填写将回退到普通关键字匹配。
              </p>
            </div>

            <div>
              <label className="text-xs font-bold block mb-1">导入数据 (CSV)</label>
              <div className="relative border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50 text-center hover:bg-gray-100 transition">
                 <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleFileUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                    <Upload className="w-4 h-4" />
                    {csvData.length > 0 ? `已加载 ${csvData.length} 条数据` : "点击上传 CSV 文件"}
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-xs font-bold block mb-1">用户角色</label>
                    <select className="w-full border p-2 rounded text-sm" value={userRole} onChange={(e:any) => setUserRole(e.target.value)}>
                        <option value="自然人">自然人 (个人)</option>
                        <option value="法人">法人 (企业)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold block mb-1">当前定位</label>
                    <select className="w-full border p-2 rounded text-sm" value={userCity} onChange={(e:any) => setUserCity(e.target.value)}>
                        <option value="长沙市">长沙市</option>
                        <option value="深圳市">深圳市</option>
                        <option value="广州市">广州市</option>
                        <option value="娄底市">娄底市</option>
                    </select>
                </div>
                 <div>
                    <label className="text-xs font-bold block mb-1">使用终端</label>
                    <select className="w-full border p-2 rounded text-sm" value={userChannel} onChange={(e:any) => setUserChannel(e.target.value)}>
                        <option value="Android">Android App</option>
                        <option value="iOS">iOS App</option>
                        <option value="Web">PC 网页</option>
                    </select>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
                <input 
                    type="checkbox" 
                    id="satSwitch"
                    checked={enableSatisfaction}
                    onChange={(e) => setEnableSatisfaction(e.target.checked)}
                />
                <label htmlFor="satSwitch" className="text-sm">启用“满意度”排序加权</label>
            </div>
          </div>
        </div>
      )}

      {/* 搜索区域 */}
      <div className="p-4 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800">
                {userRole === "自然人" ? "你要办什么事？" : "企业服务搜索"}
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
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                >
                    {loading ? "..." : "搜索"}
                </button>
            </div>
            {/* 提示信息 */}
            {csvData.length === 0 && (
                <p className="text-xs text-red-500 mt-2 text-center">请先点击右上角设置图标导入CSV数据</p>
            )}
        </div>

        {/* 意图识别结果展示 (Debug View) */}
        {intent && (
            <div className="mb-4 px-2">
                <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    AI 意图识别结果 
                    <span className="bg-blue-50 text-blue-600 px-1 rounded">
                        {intent.target === "all" ? "全对象" : intent.target}
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {intent.keywords.map((k, i) => (
                        <span key={i} className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full border border-red-100">
                            {k === query ? `原始: ${k}` : `扩展: ${k}`} -> 搜索中
                        </span>
                    ))}
                </div>
            </div>
        )}

        {/* 结果列表 */}
        <div className="space-y-3">
            {results.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    {/* 顶部标签行：模拟图中右侧的红色标签 */}
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-800 text-lg leading-tight flex-1">
                            {item.事项名称}
                        </h3>
                        {/* 智能标签展示区 */}
                        <div className="flex flex-col items-end gap-1 ml-2">
                           {item.是否高频事项 === "是" && (
                               <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                                   高频
                               </span>
                           )}
                           {/* 模拟显示AI推理路径 */}
                           {idx === 0 && query.includes("健康证") && (
                                <span className="text-[10px] bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded border border-pink-100">
                                    健康证 → {item.事项名称.substring(0,4)}...
                                </span>
                           )}
                        </div>
                    </div>

                    {/* 底部信息行 */}
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-xs">
                            <User className="w-3 h-3" />
                            {item.服务对象 || "通用"}
                        </span>
                        
                        <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs">
                            <Building2 className="w-3 h-3" />
                            {item.所属市州单位 || "省直"}
                        </span>

                        {item.满意度 && enableSatisfaction && (
                            <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded text-xs">
                                <Star className="w-3 h-3" />
                                满意度 {item.满意度}
                            </span>
                        )}

                        <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs ml-auto">
                            术语(3000)
                        </span>
                    </div>

                    {/* 调试信息: 显示为什么这个结果排在前面 */}
                    {item._debugReasons && item._debugReasons.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-50 text-[10px] text-gray-400">
                            命中: {item._debugReasons.join(", ")}
                        </div>
                    )}
                </div>
            ))}

            {results.length === 0 && !loading && intent && (
                <div className="text-center text-gray-400 py-10">
                    <p>未找到符合“{userRole}”且在“{userCity}”办理的相关服务</p>
                    <p className="text-xs mt-2">建议：尝试切换定位或角色</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
