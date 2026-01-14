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
  
  // 上下文状态
  const [userContext, setUserContext] = useState({
    role: "all",
    location: "all",
    channel: "Android", 
  });

  // API 配置状态
  const [apiConfig, setApiConfig] = useState({
    provider: "groq", // 'groq' | 'custom'
    // Groq 配置
    groqApiKey: "",
    groqModel: "llama3-70b-8192",
    // 自定义 API 配置
    customBaseUrl: "https://api.openai.com/v1",
    customApiKey: "",
    customModel: "gpt-3.5-turbo",
  });
  
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    try {
      if (DEFAULT_DATA && Array.isArray(DEFAULT_DATA)) {
        setCsvData(DEFAULT_DATA);
      }
    } catch (e) {
      console.error("数据加载错误", e);
    }
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    const query = e.target.search.value;
    
    // 校验配置
    if (!query) return alert("请输入搜索内容");
    
    const isCustom = apiConfig.provider === 'custom';
    const apiKey = isCustom ? apiConfig.customApiKey : apiConfig.groqApiKey;
    
    if (!apiKey) {
      alert(`请在 API 设置中输入 ${isCustom ? '自定义 API Key' : 'Groq API Key'}`);
      setShowConfig(true);
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
          config: {
            provider: apiConfig.provider,
            apiKey: apiKey,
            // 如果是 Custom 模式发 BaseURL，否则不发（后端用默认 Groq URL）
            baseUrl: isCustom ? apiConfig.customBaseUrl : null,
            model: isCustom ? apiConfig.customModel : apiConfig.groqModel
          }
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败: ${res.status}`);
      }
      const intent = await res.json();
      setIntentAnalysis(intent);

      const results = csvData.map(item => {
        let score = 0;
        let reasons = [];
        const itemName = (item["事项名称"] || "").toString();
        const itemLoc = (item["所属市州单位"] || "").toString();

        // 1. 关键词
        let keywordMatched = false;
        if (intent.keywords && Array.isArray(intent.keywords)) {
            intent.keywords.forEach(kw => {
                if (itemName.includes(kw)) {
                    score += 10;
                    keywordMatched = true;
                }
            });
            if (keywordMatched) reasons.push("语义匹配");
        }
        
        if (itemName.includes(query)) {
            score += 15;
            reasons.push("精确匹配");
        }

        // 2. 角色
        const targetRole = userContext.role !== "all" ? userContext.role : intent.role;
        if (targetRole && targetRole !== "null" && targetRole !== "all") {
             if (targetRole === "法人" && item["服务对象"] === "自然人") return { ...item, score: -100 };
             if (targetRole === "自然人" && item["服务对象"] === "法人") return { ...item, score: -100 };
        }

        // 3. 地点
        const targetLoc = userContext.location !== "all" ? userContext.location : intent.location;
        if (targetLoc && targetLoc !== "null" && targetLoc !== "all") {
            if (itemName.includes(targetLoc) || itemLoc.includes(targetLoc)) {
                score += 20;
                reasons.push(`匹配地区: ${targetLoc}`);
            } else if (itemLoc !== "全省通用" && !itemLoc.includes(targetLoc)) {
                score -= 50; 
            }
        }
        
        // 4. 渠道硬过滤 (模拟数据一般没填渠道，这里仅做演示逻辑)
        // 实际数据如果包含"发布渠道"字段，可以在这里增加逻辑

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
            已加载 <strong>{csvData.length}</strong> 条服务事项 · 支持 Groq 及自定义 LLM
          </p>
        </div>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className="btn-config"
          style={showConfig ? {borderColor: '#2563eb', color: '#2563eb', background: '#eff6ff'} : {}}
        >
          <Settings className="w-4 h-4" />
          API 设置
        </button>
      </div>

      {/* API 配置面板 (支持多 Tab) */}
      {showConfig && (
        <div className="config-panel">
          <div className="tabs">
            <button 
              className={`tab ${apiConfig.provider === 'groq' ? 'active' : ''}`}
              onClick={() => setApiConfig({...apiConfig, provider: 'groq'})}
            >
              Groq (推荐)
            </button>
            <button 
              className={`tab ${apiConfig.provider === 'custom' ? 'active' : ''}`}
              onClick={() => setApiConfig({...apiConfig, provider: 'custom'})}
            >
              自定义 API
            </button>
          </div>

          {apiConfig.provider === 'groq' ? (
            <div className="config-content">
              <div className="form-group config-full-width">
                <label>Groq API Key</label>
                <input 
                  type="password" 
                  value={apiConfig.groqApiKey}
                  onChange={e => setApiConfig({...apiConfig, groqApiKey: e.target.value})}
                  className="form-input"
                  placeholder="gsk_..."
                />
              </div>
              <div className="form-group config-full-width">
                <label>模型名称 (可修改)</label>
                <input 
                  type="text"
                  value={apiConfig.groqModel}
                  onChange={e => setApiConfig({...apiConfig, groqModel: e.target.value})}
                  className="form-input"
                  placeholder="例如: llama3-70b-8192"
                />
                <div style={{fontSize: 12, color: '#64748b', marginTop: 4}}>
                  常用: llama3-70b-8192, mixtral-8x7b-32768, gemma-7b-it
                </div>
              </div>
            </div>
          ) : (
            <div className="config-content">
              <div className="form-group config-full-width">
                <label>Base URL (接口地址)</label>
                <input 
                  type="text" 
                  value={apiConfig.customBaseUrl}
                  onChange={e => setApiConfig({...apiConfig, customBaseUrl: e.target.value})}
                  className="form-input"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="form-group">
                <label>API Key</label>
                <input 
                  type="password" 
                  value={apiConfig.customApiKey}
                  onChange={e => setApiConfig({...apiConfig, customApiKey: e.target.value})}
                  className="form-input"
                  placeholder="sk-..."
                />
              </div>
              <div className="form-group">
                <label>模型名称</label>
                <input 
                  type="text" 
                  value={apiConfig.customModel}
                  onChange={e => setApiConfig({...apiConfig, customModel: e.target.value})}
                  className="form-input"
                  placeholder="例如: gpt-4, deepseek-chat"
                />
              </div>
            </div>
          )}
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
            <option value="IOS">iOS</option>
            <option value="HarmonyOS">HarmonyOS</option>
            <option value="WeChat">微信小程序</option>
            <option value="Alipay">支付宝小程序</option>
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
            placeholder="例如：'公司要办营业执照' 或 '小孩要打疫苗'..."
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
          {intentAnalysis.role && intentAnalysis.role !== "null" && (
             <>
                <span>角色:</span>
                <span className="tag">{intentAnalysis.role}</span>
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
               <p>{intentAnalysis ? "未找到匹配结果，请尝试切换城市或简化关键词" : "准备就绪，请输入上方搜索框"}</p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
