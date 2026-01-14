"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
// 引入图标库
import { Search, Settings, Upload, Building2, User, Phone, MapPin, FileText, ChevronDown } from "lucide-react";
// 引入数据，确保 app/lib/data.js 存在！
import { DEFAULT_DATA } from "./lib/data";

export default function Home() {
  const [csvData, setCsvData] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [intentAnalysis, setIntentAnalysis] = useState(null);
  
  // 用户上下文
  const [userContext, setUserContext] = useState({
    role: "all",
    location: "all",
    channel: "Android", 
  });

  // API 配置
  const [apiConfig, setApiConfig] = useState({
    apiKey: "",
    model: "llama3-70b-8192"
  });
  const [showConfig, setShowConfig] = useState(false);

  // 初始化加载数据
  useEffect(() => {
    try {
      if (DEFAULT_DATA && Array.isArray(DEFAULT_DATA)) {
        setCsvData(DEFAULT_DATA);
      } else {
        console.warn("内置数据加载失败或格式错误");
      }
    } catch (e) {
      console.error("数据导入错误:", e);
    }
  }, []);

  // 搜索逻辑
  const handleSearch = async (e) => {
    e.preventDefault();
    const query = e.target.search.value;
    
    // 简单校验
    if (!query) return alert("请输入搜索内容");
    if (!apiConfig.apiKey) return alert("请点击右上角设置 Groq API Key");

    setIsSearching(true);
    setSearchResults([]);
    setIntentAnalysis(null);

    try {
      // 调用后端 API
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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败: ${res.status}`);
      }
      
      const intent = await res.json();
      setIntentAnalysis(intent);

      // 本地算分逻辑
      const results = csvData.map(item => {
        let score = 0;
        let reasons = [];
        const itemName = (item["事项名称"] || "").toString();
        const itemLoc = (item["所属市州单位"] || "").toString();

        // 1. AI 关键词匹配
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
        
        // 2. 精确匹配
        if (itemName.includes(query)) {
            score += 15;
            reasons.push("精确匹配");
        }

        // 3. 角色过滤
        const targetRole = userContext.role !== "all" ? userContext.role : intent.role;
        if (targetRole && targetRole !== "null" && targetRole !== "all") {
             if (targetRole === "法人" && item["服务对象"] === "自然人") return { ...item, score: -100 };
             if (targetRole === "自然人" && item["服务对象"] === "法人") return { ...item, score: -100 };
        }

        // 4. 地点匹配
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

  // CSV 导入逻辑
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
      {/* 顶部栏 */}
      <div className="header">
        <div className="title-group">
          <h1>
            <span className="icon-box">
              <FileText size={24} />
            </span>
            政务服务智能搜索
          </h1>
          <p className="subtitle">
            已加载 <strong>{csvData.length}</strong> 条服务事项 · 纯 CSS 极速版
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
              placeholder="请输入 gsk_ 开头的 Key"
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
            <option value="邵阳">邵阳市</option>
            <option value="岳阳">岳阳市</option>
            <option value="常德">常德市</option>
            <option value="张家界">张家界市</option>
            <option value="益阳">益阳市</option>
            <option value="郴州">郴州市</option>
            <option value="永州">永州市</option>
            <option value="娄底">娄底市</option>
            <option value="湘西">湘西州</option>
          </select>
        </div>

        <div className="form-group">
          <label><Phone size={12}/> 终端渠道</label>
          <select 
            className="form-select"
            value={userContext.channel}
            onChange={(e) => setUserContext({...userContext, channel: e.target.value})}
          >
            <option value="Android">Android</option>
            <option value="iOS">iOS</option>
            <option value="WeChat">微信小程序</option>
          </select>
        </div>

        <div className="form-group" style={{display:'flex', alignItems:'flex-end'}}>
             <label className="upload-btn">
                <Upload size={14}/>
                导入 CSV
                <input type="file" style={{display:'none'}} accept=".csv" onChange={handleFileUpload}/>
             </label>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="search-wrapper">
        <form onSubmit={handleSearch} className="search-box">
          <Search style={{marginLeft: 10, color:'#94a3b8'}} />
          <input
            name="search"
            type="text"
            placeholder="例如：'我想查一下怀化的公积金'..."
            className="search-input"
            disabled={isSearching}
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="search-btn"
          >
            {isSearching ? "分析中..." : "智能搜索"}
          </button>
        </form>
      </div>

      {/* 意图分析结果 */}
      {intentAnalysis && (
        <div className="ai-debug">
          <strong>⚡ AI 分析结果:</strong>
          <span>关键词:</span>
          {intentAnalysis.keywords?.map(k => (
              <span key={k} className="tag">{k}</span>
          ))}
          {intentAnalysis.location && intentAnalysis.location !== "null" && (
             <>
                <span>地点:</span>
                <span className="tag">{intentAnalysis.location}</span>
             </>
          )}
        </div>
      )}

      {/* 结果列表 */}
      <div className="result-list">
        {searchResults.length > 0 ? (
           searchResults.map((item, idx) => (
            <div key={idx} className="result-card">
              <div>
                 <h3 className="card-title">{item["事项名称"]}</h3>
                 <div className="card-tags">
                    <span className="meta-tag">
                      <Building2 size={12}/> {item["所属市州单位"]}
                    </span>
                    <span className="meta-tag">
                      <User size={12}/> {item["服务对象"]}
                    </span>
                    {item.matchReasons?.map((reason, i) => (
                        <span key={i} className="meta-tag match-reason">
                            {reason}
                        </span>
                    ))}
                 </div>
              </div>
              <div style={{textAlign:'right'}}>
                  <div className="card-code">{item["事项编码"]?.slice(0,8)}</div>
                  <div style={{marginTop: 5, color:'#2563eb'}}>
                      <ChevronDown />
                  </div>
              </div>
            </div>
           ))
        ) : (
          !isSearching && (
            <div className="empty-state">
               <p>{intentAnalysis ? "未找到匹配结果，请尝试简化描述" : "准备就绪，请输入上方搜索框"}</p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
