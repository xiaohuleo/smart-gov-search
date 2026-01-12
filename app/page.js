'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Settings, User, Zap, Save, MapPin, Briefcase, ThumbsUp, TrendingUp } from 'lucide-react';

// 预设配置
const PRESETS = {
  groq: { name: 'Groq (极速)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama3-8b-8192' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  custom: { name: '自定义', baseUrl: '', model: '' }
};

export default function Home() {
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchTime, setSearchTime] = useState(0);
  const [debugMsg, setDebugMsg] = useState('');
  
  // 上下文
  const [query, setQuery] = useState('');
  const [userRole, setUserRole] = useState('自然人');
  const [location, setLocation] = useState('株洲市');
  const [channel, setChannel] = useState('IOS');
  const [useSatisfaction, setUseSatisfaction] = useState(false);
  const [configOpen, setConfigOpen] = useState(true);
  const [apiConfig, setApiConfig] = useState({ baseUrl: PRESETS.groq.baseUrl, apiKey: '', model: PRESETS.groq.model });

  // 初始化加载配置
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
        alert(`成功导入 ${res.data.length} 条数据`);
      }
    });
  };

  // 核心搜索
  const handleSearch = async () => {
    if (!apiConfig.apiKey) return alert('请先配置 API Key');
    if (csvData.length === 0) return alert('请先导入 CSV');
    if (!query.trim()) return alert('请输入搜索词');

    setLoading(true);
    setResults([]);
    const startTime = performance.now();

    try {
      setDebugMsg('正在进行渠道过滤...');
      // 1. 渠道硬隔离 (Firewall)
      const channelFiltered = csvData.filter(item => {
        const itemChannels = item['发布渠道'] || "";
        const channels = itemChannels.split(/[,，;]/).map(c => c.trim().toUpperCase());
        const userChannel = channel.toUpperCase();
        return channels.length === 0 || channels.includes(userChannel);
      });

      // 2. 准备 Payload (仅发送名称和ID)
      const candidates = channelFiltered.slice(0, 40).map(item => ({
        id: item['事项编码'],
        n: item['事项名称']
      }));

      // 3. 请求 Edge API 获取语义分
      setDebugMsg('正在进行AI语义分析...');
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, candidates, config: apiConfig })
      });

      const data = await response.json();
      const aiScoresMap = data.scores || {};

      // 4. 金字塔排序算法 (Pyramid Sorting)
      setDebugMsg('正在执行政务排序...');
      
      const finalResults = channelFiltered.map(item => {
        const code = item['事项编码'];
        const aiScoreRaw = aiScoresMap[code] || 0; // 0.0 - 1.0

        // --- 权重计算 (重点) ---

        // A. 角色分 (权重: 10,000)
        // 保证 "自然人" 搜出来的结果，前几页全是 "自然人" 事项，除非没结果
        const itemTargets = (item['服务对象'] || "").split(/[,，;]/).map(t => t.trim());
        const isRoleMatch = itemTargets.some(t => t.includes(userRole)) || itemTargets.some(t => t.includes(userRole === '自然人' ? '个人' : '企业'));
        const scoreRole = isRoleMatch ? 10000 : 0;

        // B. 语义分 (权重: 1,000)
        // 放大 1000 倍。例如 0.9 -> 900分。
        // 这确保了 "强相关(0.9)" 比 "弱相关+本地(0.2+0.2)" 分数更高
        const scoreSemantic = Math.round(aiScoreRaw * 1000);

        // C. 定位分 (权重: 200)
        // 本地优先于省级，省级优先于外地
        let scoreLoc = 0;
        const itemDept = item['所属市州单位'] || "";
        if (itemDept.includes(location)) {
            scoreLoc = 200; // 精准本地
        } else if (itemDept.includes("省") || itemDept.includes("本级")) {
            scoreLoc = 150; // 省级通办 (略低于本地，但高于外地)
        } else {
            scoreLoc = 0;   // 外地 (如株洲人看长沙事项)
        }

        // D. 附加分 (权重: 50)
        let scoreBonus = 0;
        if (item['是否高频事项'] === '是') scoreBonus += 50;
        if (useSatisfaction && item['满意度']) {
            scoreBonus += parseFloat(item['满意度']) * 5; // 满分5.0 * 5 = 25分
        }

        return {
          ...item,
          aiScore: aiScoreRaw,
          isRoleMatch,
          scoreBreakdown: { role: scoreRole, ai: scoreSemantic, loc: scoreLoc, bonus: scoreBonus },
          totalScore: scoreRole + scoreSemantic + scoreLoc + scoreBonus
        };
      });

      // 5. 排序与截断
      // 过滤掉 AI认为完全不相关(<0.1) 的结果，除非它是精准的角色+高频
      const sorted = finalResults
        .filter(i => i.aiScore > 0.05 || (i.totalScore > 10100)) 
        .sort((a, b) => b.totalScore - a.totalScore);

      setResults(sorted);

    } catch (error) {
      console.error(error);
      alert('搜索出错: ' + error.message);
    } finally {
      const endTime = performance.now();
      setSearchTime(((endTime - startTime) / 1000).toFixed(2));
      setLoading(false);
      setDebugMsg('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-gray-50 flex flex-col font-sans text-slate-800">
      {/* 顶部栏 */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div>
          <h1 className="font-bold text-lg">政务搜索 V6.0 (金字塔排序)</h1>
          <p className="text-xs text-slate-400">权重优化: 角色 &gt; 语义 &gt; 定位 &gt; 高频</p>
        </div>
        <button onClick={() => setConfigOpen(!configOpen)} className="p-2 hover:bg-slate-700 rounded-full">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 配置面板 */}
      {configOpen && (
        <div className="bg-white p-4 border-b space-y-3 shadow-inner">
          <div className="flex gap-2 mb-2 overflow-x-auto">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => setApiConfig({...apiConfig, baseUrl: p.baseUrl, model: p.model})} 
                className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${apiConfig.baseUrl === p.baseUrl ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100'}`}>
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
          <div className="flex justify-between items-center pb-2 border-b">
            <span className="text-sm font-bold flex items-center gap-2"><Settings className="w-4 h-4"/> 环境模拟</span>
            <label className="text-blue-600 text-xs cursor-pointer flex items-center gap-1 hover:underline">
              <Upload className="w-3 h-3" /> 导入CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">渠道 (硬隔离)</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="Android">Android</option>
                <option value="IOS">iOS</option>
                <option value="HarmonyOS">HarmonyOS</option>
                <option value="微信小程序">微信小程序</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">角色 (第一梯队)</label>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="自然人">自然人</option>
                <option value="法人">法人</option>
              </select>
            </div>
          </div>
          
          <div className="relative">
            <MapPin className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full pl-8 p-2 border rounded text-sm" placeholder="当前定位，如：株洲市" />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 pt-1 cursor-pointer">
             <input type="checkbox" checked={useSatisfaction} onChange={e => setUseSatisfaction(e.target.checked)} className="rounded text-blue-600"/>
             启用满意度加权 (高频/好评 +50分)
          </label>
        </div>

        {/* 结果展示 */}
        {results.length > 0 && (
          <div className="text-xs text-gray-500 flex justify-between px-1">
            <span>找到 {results.length} 条</span>
            <span className="text-green-600 font-mono flex items-center gap-1">
              <Zap className="w-3 h-3"/> {searchTime}s
            </span>
          </div>
        )}
        
        {loading && <div className="text-center text-xs text-blue-600 animate-pulse">{debugMsg}</div>}

        <div className="space-y-3 pb-20">
          {results.map((item, idx) => (
            <div key={idx} className="bg-white border rounded-lg p-3 shadow-sm hover:border-blue-400 transition relative overflow-hidden group">
              {/* 顶部标签 */}
              <div className="absolute top-0 right-0 flex">
                {item.scoreBreakdown.role > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-bl-lg">角色匹配</span>
                )}
                {item.scoreBreakdown.loc > 180 && (
                   <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 ml-0.5">本地</span>
                )}
              </div>

              <h3 className="font-bold text-gray-800 text-sm pr-20">{item['事项名称']}</h3>
              
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] flex items-center gap-1">
                   <Briefcase className="w-3 h-3"/> {item['服务对象']}
                </span>
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] flex items-center gap-1">
                   <MapPin className="w-3 h-3"/> {item['所属市州单位']}
                </span>
                {item.aiScore > 0.6 && (
                   <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[10px] border border-orange-100">
                     AI强推荐
                   </span>
                )}
                {item['是否高频事项'] === '是' && (
                   <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] flex items-center gap-0.5">
                     <TrendingUp className="w-3 h-3"/> 高频
                   </span>
                )}
              </div>

              {/* 调试模式：显示分数构成 (演示时可展示专业性) */}
              <div className="mt-2 pt-2 border-t border-dashed border-gray-100 flex gap-3 text-[9px] text-gray-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Role: {item.scoreBreakdown.role}</span>
                <span>AI: {item.scoreBreakdown.ai}</span>
                <span>Loc: {item.scoreBreakdown.loc}</span>
                <span>Total: {item.totalScore}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部搜索 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-10 max-w-2xl mx-auto shadow-lg">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="请输入服务名称..." 
            className="flex-1 p-3 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
          <button onClick={handleSearch} disabled={loading} className="bg-blue-600 text-white px-6 rounded-xl font-bold text-sm min-w-[80px] hover:bg-blue-700 active:scale-95 transition">
            {loading ? '...' : '搜索'}
          </button>
        </div>
      </div>
    </div>
  );
}
