"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import { Search, Settings, Upload, Building2, User, Phone, MapPin, FileText, ChevronDown } from "lucide-react";
import { DEFAULT_DATA } from "./lib/data";

export default function Home() {
  const [csvData, setCsvData] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [intentAnalysis, setIntentAnalysis] = useState(null);
  
  const [userContext, setUserContext] = useState({
    role: "all",
    location: "all",
    channel: "Android", 
  });

  const [apiConfig, setApiConfig] = useState({
    apiKey: "",
    model: "llama3-70b-8192"
  });
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    if (DEFAULT_DATA && DEFAULT_DATA.length > 0) {
      setCsvData(DEFAULT_DATA);
    }
  }, []);

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
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          apiKey: apiConfig.apiKey,
          customModel: apiConfig.model
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "请求失败");
      }
      const intent = await res.json();
      setIntentAnalysis(intent);

      const results = csvData.map(item => {
        let score = 0;
        let reasons = [];
        const itemName = (item["事项名称"] || "").toString();
        const itemLoc = (item["所属市州单位"] || "").toString();

        let keywordMatched = false;
        if (intent.keywords && Array.isArray(intent.keywords)) {
            intent.keywords.forEach(kw => {
                if (itemName.includes(kw)) {
                    score += 10;
                    keywordMatched = true;
                }
            });
            if (keywordMatched) reasons.push("AI匹配");
        }
        
        if (itemName.includes(query)) {
            score += 15;
            reasons.push("精确匹配");
        }

        const targetRole = userContext.role !== "all" ? userContext.role : intent.role;
        if (targetRole && targetRole !== "null" && targetRole !== "all") {
             if (targetRole === "法人" && item["服务对象"] === "自然人") return { ...item, score: -100 };
             if (targetRole === "自然人" && item["服务对象"] === "法人") return { ...item, score: -100 };
        }

        const targetLoc = userContext.location !== "all" ? userContext.location : intent.location;
        if (targetLoc && targetLoc !== "null" && targetLoc !== "all") {
            if (itemName.includes(targetLoc) || itemLoc.includes(targetLoc)) {
                score += 20;
                reasons.push(`匹配地区: ${targetLoc}`);
            } else if (itemLoc !== "全省通用" && !itemLoc.includes(targetLoc)) {
                score -= 50; 
            }
        }

        return { ...item, score, matchReasons: reasons };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

      setSearchResults(results);

    } catch (err) {
      alert("搜索出错: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        alert(`已导入 ${results.data.length} 条数据`);
      }
    });
  };

  return (
    <main className="container">
      {/* 头部 */}
      <div className="header">
        <div className="title-group">
          <h1>
            <span className="icon-box">
              <FileText size={24} />
            </span>
            政务服务智能搜索
          </h1>
          <p className="subtitle">
            已加载 <strong>{csvData.length}</strong> 条服务事项 · 支持自然语言语义匹配
          </p>
        </div>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className="btn-config"
        >
          <Settings className="w-4 h-4" />
          API 设置
        </button>
      </div>

      {/* 配置面板 */}
      {showConfig && (
        <div className="config-panel">
          <div className="form-group">
            <label>Groq API Key</label>
            <input 
              type="password" 
              value={apiConfig.apiKey}
              onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
              className="form-input"
              placeholder="gsk_..."
            />
          </div>
           <div className="form-group">
            <label>模型选择</label>
            <select 
              value={apiConfig.model}
              onChange={e => setApiConfig({...apiConfig, model: e.target.value})}
              className="form-select"
            >
              <option value="llama3-70b-8192">Llama3-70b (推荐)</option>
              <option value="mixtral-8x7b-32768">Mixtral-8x7b</option>
            </select>
          </div>
        </div>
      )}

      {/* 筛选工具栏 */}
      <div className="filter-bar">
        <div className="form-group">
          <label><User size={12}/> 用户角色</label>
          <select 
            className="form-select"
            value={userContext.role}
            onChange={(e) => setUserContext({...userContext, role: e.target.value})}
          >
            <option value="all">不限 (自动识别)</option>
            <option value="自然人">自然人</option>
            <option value="法人">法人</option>
          </select>
        </div>

        <div className="form-group">
          <label><MapPin size={12}/> 当前定位</label>
          <select 
            className="form-select"
            value={userContext.location}
            onChange={(e) => setUserContext({...userContext, location: e.target.value})}
          >
            <option value="all">全省范围</option>
            <option value="长沙">长沙市</option>
            <option value="怀化">怀化市</option>
            <option value="株洲">株洲市</option>
            <option value="湘潭">湘潭市</option>
            <option value="衡阳">衡阳市</option>
            <option 
