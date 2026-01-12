'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Settings, Zap, Save, MapPin, Briefcase, Building2, Search, XCircle } from 'lucide-react';

const PRESETS = {
  groq: { name: 'Groq (极速)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama3-8b-8192' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  custom: { name: '自定义', baseUrl: '', model: '' }
};

// V12的口语字典保留，辅助动词识别
const SEMANTIC_MAPPINGS = {
  "坏": ["损坏", "换领", "更换", "失效"],
  "烂": ["损坏", "换领"],
  "折": ["损坏", "换领"],
  "断": ["损坏", "换领"],
  "旧": ["到期", "换领", "有效期"],
  "改": ["变更", "更正", "修改"],
  "错": ["变更", "更正"],
  "丢": ["补领", "补办", "遗失", "挂失"],
  "查": ["查询", "核验", "进度", "打印"],
};

export default function Home() {
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchTime, setSearchTime] = useState(0);
  const [logs, setLogs] = useState(['系统就绪']);
  
  const addLog = (msg) => setLogs(prev => [`${msg}`, ...prev]);

  // 上下文
  const [query, setQuery] = useState('');
  const [userRole, setUserRole] = useState('自然人');
  const [location, setLocation] = useState('株洲市');
  const [channel, setChannel] = useState('IOS');
  const [useSatisfaction, setUseSatisfaction] = useState(false);
  
  const [configOpen, setConfigOpen] = useState(true);
  const [apiConfig, setApiConfig] = useState({ baseUrl: PRESETS.groq.baseUrl, apiKey: '', model: PRESETS.groq.model });

  useEffect(() => {
    const savedKey = localStorage.getItem('gov_search_api_key');
    const savedBase = localStorage.getItem('gov_search_base_url');
    if (savedKey) setApiConfig(prev => ({ ...prev, apiKey: savedKey }));
    if (savedBase) setApiConfig(prev => ({ ...prev, baseUrl: savedBase }));
  }, []);

  const saveConfig = () => {
    localStorage.setItem('gov_search_api_key', apiConfig.apiKey);
    localStorage.setItem('gov_search_base_url', apiConfig.baseUrl);
    setConfigOpen(false);
    alert('配置已保存');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setCsvData(res.data);
        addLog(`导入数据: ${res.data.length} 条`);
        alert(`成功导入 ${res.data.length} 条数据`);
      }
    });
  };

  const handleSearch = async () => {
    if (!apiConfig.apiKey) return alert('请先配置 API Key');
    if (csvData.length === 0) return alert('请先导入 CSV');
    if (!query.trim()) return alert('请输入搜索词');

    setLoading(true);
    setResults([]);
    const startTime = performance.now();
    addLog(`🔍 搜索: "${query}"`);

    try {
      // 1. 渠道过滤
      const channelFiltered = csvData.filter(item => {
        const itemChannels = item['发布渠道'] || "";
        // 兼容中文分号、斜杠等分隔符
        const channels = itemChannels.split(/[,，;、/]/).map(c => c.trim().toUpperCase());
        const userChannel = channel.toUpperCase();
        return channels.length === 0 || channels.includes(userChannel);
      });

      // 2. 准备 Payload
      const candidates = channelFiltered.slice(0, 50).map(item => ({
        id: item['事项编码'],
        n: item['事项名称'],
        d: (item['事项描述'] || "").substring(0, 50)
      }));

      // 3. AI 分析
      addLog('🤖 AI + 关键词双重匹配...');
      let aiScoresMap = {};
      
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, candidates, config: apiConfig })
        });
        const data = await response.json();
        aiScoresMap = data.scores || {};
      } catch (e) {
        addLog('AI服务超时，降级为纯文本匹配');
      }

      // 4. V13.0 排序算法：字面匹配霸权
      const finalResults = channelFiltered.map(item => {
        const code = item['事项编码'];
        const name = item['事项名称'];
        const desc = item['事项描述'] || "";
        const aiScore = aiScoresMap[code] || 0;
        
        let totalScore = aiScore * 1000; 
        let matchReason = "";

        // --- A. 字面包含匹配 (Text Match) [霸权逻辑] ---
        // 只要服务名称里包含了用户的搜索词，或者包含了搜索词的一部分（超过2个字）
        // 直接给予极高分，这比 AI 猜的更准
        let textMatchBonus = 0;
        
        // 1. 完全包含 (如搜"政策"，命中"政策速递")
        if (name.includes(query)) {
            textMatchBonus = 2000; 
            matchReason = "名称包含";
        } 
        // 2. 部分包含 (如搜"政策解读"，命中"政策速递") - 防止漏网
        else if (query.length >= 2 && name.includes(query.substring(0, 2))) {
            textMatchBonus = 500;
            matchReason = "部分包含";
        }

        totalScore += textMatchBonus;

        // --- B. 口语字典匹配 ---
        let actionBonus = 0;
        Object.keys(SEMANTIC_MAPPINGS).forEach(userVerb => {
          if (query.includes(userVerb)) {
            const officialTerms = SEMANTIC_MAPPINGS[userVerb];
            if (officialTerms.some(term => name.includes(term))) {
              actionBonus = 800;
              matchReason = matchReason || "口语命中";
            }
          }
        });
        totalScore += actionBonus;

        // --- C. 角色 & 定位 ---
        // 增强版分隔符：支持 / 、 , ;
        const itemTargets = (item['服务对象'] || "").split(/[,，;、/]/).map(t => t.trim());
        
        // 角色匹配宽松化：只要不冲突就不扣分
        const isRoleMatch = itemTargets.some(t => t.includes(userRole)) || 
                            itemTargets.some(t => t.includes(userRole === '自然人' ? '个人' : '企业')) ||
                            itemTargets.includes("全部"); // 如果CSV里有“全部”
        
        const itemDept = item['所属市州单位'] || "";
        const isLocValid = itemDept.includes(location) || itemDept.includes('省') || itemDept.includes('中央') || itemDept.includes('国家');

        if (!isRoleMatch) totalScore -= 300; 
        if (!isLocValid) totalScore -= 500;

        // --- D. 附加 ---
        if (item['是否高频事项'] === '是') totalScore += 50; 
        if (useSatisfaction && item['满意度']) totalScore += parseFloat(item['满意度']) * 5;

        return {
          ...item,
          aiScore,
          textMatchBonus,
          matchReason,
          isRoleMatch,
          isLocValid,
          totalScore
        };
      });

      // 5. 排序与洁癖过滤
      const sorted = finalResults
        .filter(i => {
            // 过滤逻辑：
            // 1. 总分必须 > 100 (排除只有高频加分但完全不相关的)
            // 2. 或者有明确的字面/口语匹配
            return i.totalScore > 100 || i.textMatchBonus > 0 || i.matchReason !== "";
        })
        .sort((a, b) => b.totalScore - a.totalScore);

      setResults(sorted);

    } catch (error) {
      console.error(error);
      addLog(`❌ 错误: ${error.message}`);
    } finally {
      const endTime = performance.now();
      setSearchTime(((endTime - startTime) / 1000).toFixed(2));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-gray-50 flex flex-col font-sans text-slate-800 pb-32">
      {/* 顶部栏 */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div>
          <h1 className="font-bold text-lg">政务搜索 V13.0 (霸权版)</h1>
          <p className="text-xs text-slate-400">字面匹配优先 | 噪音彻底过滤</p>
        </div>
        <button onClick={() => setConfigOpen(!configOpen)} className="p-2 hover:bg-slate-700 rounded-full">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 日志 */}
      <div className="bg-black text-green-400 p-2 text-[10px] font-mono h-20 overflow-y-auto">
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>

      {/* 配置面板 */}
      {configOpen && (
        <div className="bg-white p-4 border-b space-y-3 shadow-inner">
          <div className="flex gap-2 mb-2 overflow-x-auto">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => setApiConfig({...apiConfig, baseUrl: p.baseUrl, model: p.model})} 
                className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap ${apiConfig.baseUrl === p.baseUrl ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <input type="text" value={apiConfig.baseUrl} onChange={e => setApiConfig({...apiConfig, baseUrl: e.target.value})} className="w-full p-2 border rounded text-xs font-mono bg-gray-50" placeholder="Base URL" />
            <input type="text" value={apiConfig.model} onChange={e => setApiConfig({...apiConfig, model: e.target.value})} className="w-full p-2 border rounded text-xs font-mono bg-gray-50" placeholder="Model Name" />
            <input type="password" value={apiConfig.apiKey} onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})} className="w-full p-2 border rounded text-xs font-mono bg-gray-50" placeholder="API Key" />
          </div>
          <button onClick={saveConfig} className="w-full bg-slate-800 text-white py-2 rounded text-xs flex justify-center gap-2">
            <Save className="w-4 h-4" /> 保存配置
          </button>
        </div>
      )}

      <div className="p-4 space-y-4 flex-1">
        {/* 数据源与环境 */}
        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">渠道</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="Android">Android</option>
                <option value="IOS">iOS</option>
                <option value="微信小程序">微信小程序</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">角色</label>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="自然人">自然人</option>
                <option value="法人">法人</option>
              </select>
            </div>
          </div>
          <div className="relative">
            <MapPin className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full pl-8 p-2 border rounded text-sm" placeholder="当前定位" />
          </div>
           <div className="flex justify-between items-center pt-1">
            <label className="text-blue-600 text-xs cursor-pointer flex items-center gap-1 hover:underline">
              <Upload className="w-3 h-3" /> 导入CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
               <input type="checkbox" checked={useSatisfaction} onChange={e => setUseSatisfaction(e.target.checked)} className="rounded text-blue-600"/>
               满意度加权
            </label>
          </div>
        </div>

        {/* 结果展示 */}
        {results.length > 0 ? (
          <div className="text-xs text-gray-500 flex justify-between px-1">
            <span>找到 {results.length} 条</span>
            <span className="text-green-600 font-mono flex items-center gap-1">
              <Zap className="w-3 h-3"/> {searchTime}s
            </span>
          </div>
        ) : (
          !loading && <div className="text-center text-gray-400 text-sm py-10">
            暂无结果<br/>
            <span className="text-xs text-gray-300">系统已过滤低相关性内容</span>
          </div>
        )}
        
        {loading && <div className="text-center text-xs text-blue-600 animate-pulse">AI 思考中...</div>}

        <div className="space-y-3">
          {results.map((item, idx) => (
            <div key={idx} className="bg-white border rounded-lg p-3 shadow-sm hover:border-blue-400 transition relative overflow-hidden group">
              {/* 顶部标签 */}
              <div className="absolute top-0 right-0 flex">
                 {item.textMatchBonus > 0 && (
                   <span className="px-2 py-0.5 text-[10px] font-bold bg-pink-100 text-pink-700 rounded-bl-lg">精准匹配</span>
                 )}
                 {item.aiScore > 0.8 && !item.textMatchBonus && (
                   <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-bl-lg">AI推荐</span>
                 )}
              </div>

              <h3 className="font-bold text-gray-800 text-sm pr-20">{item['事项名称']}</h3>
              
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <span className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${item.isRoleMatch ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-600'}`}>
                   <Briefcase className="w-3 h-3"/> {item['服务对象']}
                </span>
                
                <span className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${item['所属市州单位'].includes('省') ? 'bg-purple-50 text-purple-700 font-medium' : 'bg-gray-100 text-gray-600'}`}>
                   <Building2 className="w-3 h-3"/> {item['所属市州单位']}
                </span>

                {/* 调试：显示命中原因 */}
                {item.matchReason && (
                   <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] border border-blue-100">
                     {item.matchReason}
                   </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-10 max-w-2xl mx-auto shadow-lg">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜服务 (如: 政策解读)..." 
            className="flex-1 p-3 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
          <button onClick={handleSearch} disabled={loading} className="bg-blue-600 text-white px-6 rounded-xl font-bold text-sm min-w-[80px] active:scale-95 transition">
            {loading ? '...' : '搜索'}
          </button>
        </div>
      </div>
    </div>
  );
}
