"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { Search, Settings, Upload, CheckCircle2, AlertCircle, Building2, User, Phone, MapPin } from "lucide-react";

export default function Home() {
  // 1. 基础数据状态
  const [csvData, setCsvData] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [intentAnalysis, setIntentAnalysis] = useState(null);
  
  // 2. 用户上下文配置（模拟无法获取的系统信息）
  const [userContext, setUserContext] = useState({
    role: "all", // all, 自然人, 法人
    location: "all", // 对应“所属市州单位”
    channel: "Android", // 对应“发布渠道”
    useSatisfaction: false, // 是否开启满意度排序
  });

  // 3. API 配置
  const [apiConfig, setApiConfig] = useState({
    apiKey: "", // Groq API Key
    baseUrl: "", 
    model: "llama3-70b-8192"
  });
  const [showConfig, setShowConfig] = useState(false);

  // 文件上传处理
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoadingFile(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // 简单清洗数据，确保字段存在
        const cleanData = results.data.map(item => ({
          ...item,
          // 防止字段为空导致的报错
          "事项名称": item["事项名称"] || "无名称",
          "服务对象": item["服务对象"] || "全员",
          "发布渠道": item["发布渠道"] || "",
          "所属市州单位": item["所属市州单位"] || "",
          "满意度": parseFloat(item["满意度"]) || 0, // 假设CSV有满意度字段，没有则为0
          "搜索量": parseInt(item["搜索量"]) || 0 // 假设有，或者用是否高频代替
        }));
        setCsvData(cleanData);
        setLoadingFile(false);
      },
      error: (err) => {
        alert("文件解析失败: " + err.message);
        setLoadingFile(false);
      }
    });
  };

  // 核心搜索逻辑
  const handleSearch = async (e) => {
    e.preventDefault();
    const query = e.target.search.value;
    if (!query || !apiConfig.apiKey) {
      alert("请输入搜索内容并确保已配置 API Key");
      return;
    }
    if (csvData.length === 0) {
      alert("请先上传数据文件 (CSV)");
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setIntentAnalysis(null);

    try {
      // 第一步：调用 LLM 获取意图
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

      // 第二步：本地加权排序与过滤 (模拟ES打分机制)
      const results = csvData.map(item => {
        let score = 0;
        let reasons = [];

        // --- 1. 硬过滤 (Hard Filters) ---
        // 渠道过滤 (模拟前端选择Android时不能搜到iOS专属)
        if (userContext.channel && item["发布渠道"] && !item["发布渠道"].includes(userContext.channel) && !item["发布渠道"].includes("通用")) {
            return { ...item, score: -1 }; // 排除
        }

        // 角色过滤 (如果用户手动选了法人，必须过滤掉仅限自然人的)
        // 逻辑：如果上下文是法人，且事项只服务自然人 -> 排除
        if (userContext.role === "法人" && item["服务对象"].includes("自然人") && !item["服务对象"].includes("法人")) return { ...item, score: -1 };
        if (userContext.role === "自然人" && item["服务对象"].includes("法人") && !item["服务对象"].includes("自然人")) return { ...item, score: -1 };

        // --- 2. 文本相关性打分 ---
        const text = (item["事项名称"] + item["事项描述"] + item["事项标签"]).toLowerCase();
        
        // 匹配 LLM 提取的关键词
        if (intent.keywords && Array.isArray(intent.keywords)) {
            intent.keywords.forEach(kw => {
                if (text.includes(kw.toLowerCase())) {
                    score += 10;
                    reasons.push(`匹配关键词: ${kw}`);
                }
            });
        }
        
        // 匹配用户原始输入
        if (text.includes(query.toLowerCase())) {
            score += 5;
        }

        // --- 3. 上下文加权 ---
        // LLM 意图匹配 (如：LLM识别出是“税务”，增加税务局相关事项权重)
        if (intent.category_intent && item["所属市州单位"] && item["所属市州单位"].includes(intent.category_intent)) {
            score += 8;
            reasons.push(`匹配意图部门: ${intent.category_intent}`);
        }

        // 地点匹配 (手动选择 或 LLM推测)
        const targetLoc = userContext.location !== "all" ? userContext.location : intent.implied_location;
        if (targetLoc && targetLoc !== "null" && item["所属市州单位"].includes(targetLoc)) {
            score += 15; // 此时地点匹配非常重要
            reasons.push(`匹配地点: ${targetLoc}`);
        }

        // --- 4. 业务属性加权 ---
        // 高频事项
        if (item["是否高频事项"] === "是") {
            score += 3;
            reasons.push("高频事项");
        }

        // 满意度排序开关
        if (userContext.useSatisfaction && item["满意度"]) {
            // 假设满意度是 1-10 或 1-100，归一化加分
            score += (item["满意度"] / 10); 
        }

        return { ...item, score, matchReasons: reasons };
      })
      .filter(item => item.score > 0) // 过滤掉不匹配的
      .sort((a, b) => b.score - a.score); // 按分数降序

      setSearchResults(results);

    } catch (err) {
      alert("搜索出错: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      {/* 顶部 Header */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">智慧政务服务搜索</h1>
          <p className="text-sm text-slate-500">基于 LLM 意图识别 + 本地数据动态匹配</p>
        </div>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition"
        >
          <Settings className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* 配置面板 (可折叠) */}
      {showConfig && (
        <div className="bg-white p-4 rounded-lg shadow-sm border space-y-4 animate-in fade-in slide-in-from-top-2">
          <h3 className="font-semibold text-slate-700">环境与 API 配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Groq API Key (必填)</label>
              <input 
                type="password" 
                value={apiConfig.apiKey}
                onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                placeholder="gsk_..."
              />
            </div>
             <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">自定义 API Base URL (选填)</label>
              <input 
                type="text" 
                value={apiConfig.baseUrl}
                onChange={e => setApiConfig({...apiConfig, baseUrl: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                placeholder="https://api.groq.com/openai/v1"
              />
            </div>
          </div>
          <div className="bg-blue-50 p-3 rounded text-xs text-blue-700">
             提示：若无 Groq Key，可访问 console.groq.com 免费申请。
          </div>
        </div>
      )}

      {/* 上下文模拟控制区 */}
      <div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <User className="w-3 h-3"/> 模拟角色
          </label>
          <select 
            className="w-full text-sm border-slate-200 rounded-md p-1.5 border"
            value={userContext.role}
            onChange={(e) => setUserContext({...userContext, role: e.target.value})}
          >
            <option value="all">不限角色</option>
            <option value="自然人">自然人 (个人)</option>
            <option value="法人">法人 (企业)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <MapPin className="w-3 h-3"/> 所在位置
          </label>
          <select 
            className="w-full text-sm border-slate-200 rounded-md p-1.5 border"
            value={userContext.location}
            onChange={(e) => setUserContext({...userContext, location: e.target.value})}
          >
            <option value="all">全省</option>
            <option value="广州">广州市</option>
            <option value="深圳">深圳市</option>
            <option value="珠海">珠海市</option>
            {/* 实际项目中这里应从CSV动态提取 */}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Phone className="w-3 h-3"/> 终端渠道
          </label>
          <select 
            className="w-full text-sm border-slate-200 rounded-md p-1.5 border"
            value={userContext.channel}
            onChange={(e) => setUserContext({...userContext, channel: e.target.value})}
          >
            <option value="Android">Android App</option>
            <option value="iOS">iOS App</option>
            <option value="PC">PC 网页端</option>
            <option value="WeChat">微信小程序</option>
          </select>
        </div>

        <div className="flex items-center space-x-2 pt-5">
           <input 
            type="checkbox" 
            id="satisfaction"
            checked={userContext.useSatisfaction}
            onChange={(e) => setUserContext({...userContext, useSatisfaction: e.target.checked})}
            className="rounded text-blue-600 focus:ring-blue-500"
           />
           <label htmlFor="satisfaction" className="text-sm text-slate-700 cursor-pointer">
             按满意度优先
           </label>
        </div>
      </div>

      {/* CSV 上传区 */}
      {csvData.length === 0 ? (
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition">
          <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
          <h3 className="text-lg font-medium text-slate-700">导入事项数据文件</h3>
          <p className="text-sm text-slate-500 mb-4">支持 CSV 格式，需包含事项名称、编码、服务对象等字段</p>
          <input 
            type="file" 
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
            "
          />
          {loadingFile && <p className="mt-2 text-blue-600">正在解析数据...</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between bg-green-50 px-4 py-2 rounded text-sm text-green-800">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> 已加载 {csvData.length} 条服务事项</span>
          <button onClick={() => setCsvData([])} className="text-green-600 hover:underline">重新上传</button>
        </div>
      )}

      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="relative">
        <input
          name="search"
          type="text"
          placeholder="请输入您的需求，例如：'我想开一家餐饮店' 或 '提取公积金'..."
          className="w-full p-4 pl-12 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none shadow-sm text-lg"
          disabled={isSearching}
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
        <button 
          type="submit" 
          disabled={isSearching}
          className="absolute right-2 top-2 bottom-2 bg-blue-600 text-white px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 transition"
        >
          {isSearching ? "分析中..." : "智能搜索"}
        </button>
      </form>

      {/* 意图分析展示 (Debug视图) */}
      {intentAnalysis && (
        <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800 space-y-1">
          <p><strong>🤖 AI 意图识别结果：</strong></p>
          <div className="flex gap-4 flex-wrap">
            <span>关键词: {intentAnalysis.keywords?.join(", ")}</span>
            <span>推测角色: {intentAnalysis.implied_role || "未识别"}</span>
            <span>推测地点: {intentAnalysis.implied_location || "未识别"}</span>
            <span>意图领域: {intentAnalysis.category_intent || "通用"}</span>
          </div>
        </div>
      )}

      {/* 结果列表 */}
      <div className="space-y-4">
        {searchResults.length > 0 ? (
           searchResults.map((item, idx) => (
            <div key={idx} className="bg-white p-5 rounded-lg border hover:shadow-md transition group">
              <div className="flex justify-between items-start">
                <div>
                   <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600">
                        {item["事项名称"]}
                      </h3>
                      {item["是否高频事项"] === "是" && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">高频</span>
                      )}
                      <span className="text-xs text-slate-400 border px-1 rounded">{item["事项编码"]}</span>
                   </div>
                   
                   <p className="text-sm text-slate-500 mb-3 line-clamp-2">{item["事项描述"] || "暂无描述"}</p>
                   
                   <div className="flex flex-wrap gap-y-2 gap-x-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
                        <Building2 className="w-3 h-3"/> {item["所属市州单位"] || "省级通用"}
                      </span>
                      <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
                        <User className="w-3 h-3"/> {item["服务对象"]}
                      </span>
                   </div>
                </div>
                {/* 调试用：显示匹配得分 */}
                <div className="text-right hidden md:block">
                   <div className="text-2xl font-bold text-blue-600">{item.score.toFixed(1)}</div>
                   <div className="text-xs text-slate-400">匹配度得分</div>
                </div>
              </div>
              
              {/* 匹配原因展示 */}
              {item.matchReasons && item.matchReasons.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                  <span className="font-semibold">匹配原因：</span> {item.matchReasons.join(" · ")}
                </div>
              )}
            </div>
           ))
        ) : (
          !isSearching && intentAnalysis && (
            <div className="text-center py-10 text-slate-500">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-300"/>
              <p>未找到匹配的服务事项，请尝试调整筛选条件或搜索词。</p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
