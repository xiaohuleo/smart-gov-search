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
                    
