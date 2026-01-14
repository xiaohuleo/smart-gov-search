"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import Fuse from "fuse.js";
import { Search, Upload, Settings, MapPin, User, Smartphone, ThumbsUp, Loader2 } from "lucide-react";

// 定义与CSV表头完全一致的数据接口
interface ServiceItem {
  "事项名称": string;
  "事项编码": string;
  "服务对象": string;      // 自然人, 法人, 自然人,法人
  "所属市州单位": string;   // 湖南省, 长沙市, 娄底市...
  "发布渠道": string;      // PC端, 移动端, APP, 自助终端
  "是否高频事项": string;   // 是, 否
  "满意度"?: string;       // 假设 CSV 包含此列，例如 "4.9" 或 "98"
  "事项简称"?: string;
  "事项描述"?: string;
  [key: string]: any;     // 允许其他未定义字段
}

export default function Home() {
  // --- 1. 核心数据状态 ---
  const [data, setData] = useState<ServiceItem[]>([]);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string[]>([]); // 存储AI分析后的关键词

  // --- 2. 模拟环境配置 (用户画像) ---
  const [userRole, setUserRole] = useState("全部");       // 身份：全部/自然人/法人
  const [location, setLocation] = useState("全部");       // 定位：全部/长沙/株洲...
  const [terminal, setTerminal] = useState("Android");    // 终端：Android/Web/iOS
  const [sortBySatisfaction, setSortBySatisfaction] = useState(false); // 排序开关

  // --- 3. 处理 CSV 上传 ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          console.log("CSV Loaded:", results.data.length);
          setData(results.data as ServiceItem[]);
        },
      });
    }
  };

  // --- 4. 核心搜索逻辑 (AI + 本地) ---
  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setAiAnalysisResult([]); // 重置上一轮结果

    try {
      // 步骤 A: 问后端 API，把 "我要办健康证" 翻译成标准关键词
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      
      const data = await res.json();
      const keywords = data.keywords || [query];
      
      // 步骤 B: 拿到关键词，更新状态，触发下方的 useMemo 重新计算列表
      console.log("AI分析结果:", keywords);
      setAiAnalysisResult(keywords);
    } catch (err) {
      console.error("Search API failed:", err);
      setAiAnalysisResult([query]); // 降级处理
    } finally {
      setIsSearching(false);
    }
  };

  // --- 5. 结果计算与渲染逻辑 (包含 过滤 + 排序) ---
  const filteredResults = useMemo(() => {
    if (data.length === 0) return [];

    let results = data;

    // A. 关键词搜索 (如果进行了搜索)
    if (aiAnalysisResult.length > 0) {
      // 配置 Fuse.js 模糊搜索
      const fuse = new Fuse(results, {
        keys: ["事项名称", "事项简称", "事项描述"], 
        threshold: 0.3, // 匹配阈值，越低越精确
        ignoreLocation: true,
      });

      // 对 AI 给出的每个关键词都搜一遍，然后取并集
      const matchedSet = new Set<ServiceItem>();
      aiAnalysisResult.forEach(keyword => {
        const searchRes = fuse.search(keyword);
        searchRes.forEach(item => matchedSet.add(item.item));
      });
      
      // 转回数组
      results = Array.from(matchedSet);
    }

    // B. 硬规则过滤 (环境模拟)
    results = results.filter(item => {
      // 1. 身份过滤
      if (userRole !== "全部") {
        const target = item["服务对象"] || "";
        // 如果数据里没填，默认都显示；如果填了，必须包含当前角色
        if (target && !target.includes(userRole)) return false;
      }

      // 2. 终端过滤 (关键逻辑：Android 搜不到只在 Web 发布的服务)
      if (terminal === "Android" || terminal === "iOS") {
        const channel = item["发布渠道"] || "";
        // 如果渠道明确写了，且不包含 APP/移动端/Android，则过滤掉
        // 假设 CSV 格式为 "PC端;移动端(APP)"
        const isMobile = channel.includes("APP") || channel.includes("移动") || channel.includes("Android") || channel.includes("iOS");
        const isOnlyWeb = channel.includes("PC") || channel.includes("Web");
        
        // 如果只写了 PC/Web，没写移动端，则在手机上隐藏
        if (isOnlyWeb && !isMobile && channel !== "") return false;
      }

      // 3. 定位过滤 (本地化)
      if (location !== "全部") {
        const itemLoc = item["所属市州单位"] || "";
        // 显示逻辑：显示“省级” + “当前选中市”
        // 假设数据里是 "长沙市行政审批局"，则包含 "长沙"
        const matchLoc = itemLoc.includes(location);
        const matchProv = itemLoc.includes("省"); 
        if (!matchLoc && !matchProv) return false;
      }

      return true;
    });

    // C. 排序逻辑
    results.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // 1. 高频优先
      if (a["是否高频事项"] === "是") scoreA += 20;
      if (b["是否高频事项"] === "是") scoreB += 20;

      // 2. 满意度排序 (如果开关开启)
      if (sortBySatisfaction) {
        // 解析满意度，去除%号等非数字字符
        const getSat = (val?: string) => parseFloat((val || "0").replace(/[^0-9.]/g, ""));
        scoreA += getSat(a["满意度"]);
        scoreB += getSat(b["满意度"]);
      }

      // 3. 本地事项略微优先于省级 (假设用户更倾向于办本地的)
      if (location !== "全部") {
        if (a["所属市州单位"]?.includes(location)) scoreA += 5;
        if (b["所属市州单位"]?.includes(location)) scoreB += 5;
      }

      return scoreB - scoreA; // 分数高在在顶
    });

    return results;
  }, [data, aiAnalysisResult, userRole, location, terminal, sortBySatisfaction]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-10">
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-lg">
        
        {/* 顶部导航与配置区 */}
        <header className="bg-blue-600 p-4 text-white">
          <h1 className="text-xl font-bold mb-4">政务服务智能检索</h1>
          
          {/* CSV 导入 */}
          <label className="flex items-center justify-center gap-2 bg-blue-700/50 hover:bg-blue-700 rounded-lg p-3 cursor-pointer transition border border-blue-400 border-dashed mb-4">
            <Upload size={18} />
            <span className="text-sm">点击导入服务事项 CSV 文件</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          {/* 模拟环境设置面板 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-xs space-y-2">
            <div className="flex items-center gap-1 font-bold text-blue-100 mb-1">
              <Settings size={12} /> 模拟用户环境 (Demo配置)
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="flex items-center gap-1 opacity-80"><User size={10}/> 办理身份</span>
                <select 
                  value={userRole} 
                  onChange={e => setUserRole(e.target.value)}
                  className="w-full bg-blue-800/50 rounded px-2 py-1 border border-blue-500/30 text-white outline-none"
                >
                  <option value="全部">全部角色</option>
                  <option value="自然人">个人 (自然人)</option>
                  <option value="法人">企业 (法人)</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="flex items-center gap-1 opacity-80"><MapPin size={10}/> 当前定位</span>
                <select 
                  value={location} 
                  onChange={e => setLocation(e.target.value)}
                  className="w-full bg-blue-800/50 rounded px-2 py-1 border border-blue-500/30 text-white outline-none"
                >
                  <option value="全部">全省范围</option>
                  <option value="长沙">长沙市</option>
                  <option value="株洲">株洲市</option>
                  <option value="湘潭">湘潭市</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="flex items-center gap-1 opacity-80"><Smartphone size={10}/> 使用终端</span>
                <select 
                  value={terminal} 
                  onChange={e => setTerminal(e.target.value)}
                  className="w-full bg-blue-800/50 rounded px-2 py-1 border border-blue-500/30 text-white outline-none"
                >
                  <option value="Android">安卓 APP</option>
                  <option value="iOS">苹果 APP</option>
                  <option value="Web">电脑网页</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="flex items-center gap-1 opacity-80"><ThumbsUp size={10}/> 排序偏好</span>
                <div 
                  onClick={() => setSortBySatisfaction(!sortBySatisfaction)}
                  className={`w-full px-2 py-1 rounded border cursor-pointer flex items-center justify-between ${sortBySatisfaction ? 'bg-green-500/80 border-green-400' : 'bg-blue-800/50 border-blue-500/30'}`}
                >
                  <span>满意度优先</span>
                  <div className={`w-2 h-2 rounded-full ${sortBySatisfaction ? 'bg-white' : 'bg-gray-400'}`}></div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 搜索框 (吸顶) */}
        <div className="sticky top-0 bg-white p-4 shadow-sm z-10 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="例如：我要办健康证、注册公司..."
              className="w-full pl-4 pr-12 py-3 bg-gray-100 rounded-full focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="absolute right-2 top-1.5 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-blue-400 transition"
            >
              {isSearching ? <Loader2 className="animate-spin" size={20}/> : <Search size={20} />}
            </button>
          </div>
          
          {/* 显示 AI 分析的中间过程 (增加可解释性) */}
          {aiAnalysisResult.length > 0 && (
            <div className="mt-2 text-xs text-gray-500 flex flex-wrap items-center gap-1">
              <span>🤖 AI 识别意图:</span>
              {aiAnalysisResult.map((k, i) => (
                <span key={i} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 结果列表 */}
        <div className="p-4 space-y-4">
          {data.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="mb-2">⚠️ 无数据</div>
              <p className="text-sm">请先在顶部点击导入 CSV 文件</p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p>未找到符合条件的服务</p>
              <p className="text-xs mt-2 text-gray-400">
                当前筛选: {location}/{userRole}/{terminal}
                <br/>尝试切换模拟环境或更换搜索词
              </p>
            </div>
          ) : (
            filteredResults.map((item, idx) => (
              <div key={idx} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-gray-800 text-lg mb-1">{item["事项名称"]}</h3>
                  {item["是否高频事项"] === "是" && (
                    <span className="shrink-0 bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      高频
                    </span>
                  )}
                </div>

                {/* 补充显示的字段 */}
                <div className="flex flex-wrap gap-2 my-2 text-xs">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {item["所属市州单位"]}
                  </span>
                  <span className={`px-2 py-1 rounded ${item["服务对象"]?.includes("法人") ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
                    {item["服务对象"]}
                  </span>
                  {item["满意度"] && sortBySatisfaction && (
                    <span className="bg-yellow-50 text-yellow-600 px-2 py-1 rounded flex items-center gap-1">
                      <ThumbsUp size={10} /> {item["满意度"]}
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-end mt-3 border-t border-gray-50 pt-3">
                  <div className="text-xs text-gray-400 font-mono">
                    编码: {item["事项编码"]}
                  </div>
                  <button className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-full hover:bg-blue-700 transition">
                    在线办理
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
