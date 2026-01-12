'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Settings, Zap, Save, MapPin, Briefcase, Building2 } from 'lucide-react';

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
  
  // 配置
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

    try {
      // 1. 渠道过滤
      const channelFiltered = csvData.filter(item => {
        const itemChannels = item['发布渠道'] || "";
        const channels = itemChannels.split(/[,，;]/).map(c => c.trim().toUpperCase());
        const userChannel = channel.toUpperCase();
        return channels.length === 0 || channels.includes(userChannel);
      });

      // 2. AI 意图识别
      setDebugMsg('AI 正在理解意图...');
      const candidates = channelFiltered.slice(0, 50).map(item => ({
        id: item['事项编码'],
        n: item['事项名称']
      }));

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, candidates, config: apiConfig })
      });

      const data = await response.json();
      
      // 修复：增加错误检查，防止静默失败
      if (data.error) {
        throw new Error(`AI 服务报错: ${data.error}`);
      }
      
      const aiScoresMap = data.scores || {};

      // 3. 排序逻辑
      setDebugMsg('正在进行多维排序...');
      
      const finalResults = channelFiltered.map(item => {
        const code = item['事项编码'];
        let totalScore = (aiScoresMap[code] || 0) * 100;
        
        // 角色判断
        const itemTargets = (item['服务对象'] || "").split(/[,，;]/).map(t => t.trim());
        const isRoleMatch = itemTargets.some(t => t.includes(userRole)) || itemTargets.some(t => t.includes(userRole === '自然人' ? '个人' : '企业'));
        
        // 定位判断
        const itemDept = item['所属市州单位'] || "";
        const isLocValid = itemDept.includes(location) || itemDept.includes('省') || itemDept.includes('中央') || itemDept.includes('国家');

        // 扣分逻辑
        if (!isRoleMatch) totalScore -= 20;
        if (!isLocValid) totalScore -= 40;

        // 加分逻辑
        if (item['是否高频事项'] === '是') totalScore += 5;
        if (useSatisfaction && item['满意度']) totalScore += parseFloat(item['满意度']);

        return {
          ...item,
          aiScore: aiScoresMap[code] || 0,
          isRoleMatch,
          isLocValid,
          totalScore
        };
      });

      const sorted = finalResults
        .filter(i => i.totalScore > 10)
        .sort((a, b) => b.totalScore - a.totalScore);

      setResults(sorted);

    } catch (error) {
      console.error(error);
      alert('搜索中断: ' + error.message);
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
          <h1 className="font-bold text-lg">政务搜索 V7.1 (稳定版)</h1>
          <p className="text-xs text-slate-400">意图优先 | 逻辑修复 | 鲁棒性增强</p>
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
          <div className="flex justify-between items-center pb-2 border-b">
            <span className="text-sm font-bold flex items-center gap-2"><Settings className="w-4 h-4"/> 环境模拟</span>
            <label className="text-blue-600 text-xs cursor-pointer flex items-center gap-1 hover:underline">
              <Upload className="w-3 h-3" /> 导入CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          
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

          <label className="flex items-center gap-2 text-xs text-gray-600 pt-1 cursor-pointer">
             <input type="checkbox" checked={useSatisfaction} onChange={e => setUseSatisfaction(e.target.checked)} className="rounded text-blue-600"/>
             启用满意度加权
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
              <div className="absolute top-0 right-0 flex">
                {!item.isLocValid && <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-200 text-gray-500 rounded-bl-lg">外地</span>}
                {!item.isRoleMatch && <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-bl-lg ml-px">角色不符</span>}
                {item.isLocValid && item.isRoleMatch && <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-bl-lg">精准</span>}
              </div>

              <h3 className="font-bold text-gray-800 text-sm pr-20">{item['事项名称']}</h3>
              
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <span className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${item.isRoleMatch ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-600 line-through decoration-amber-600'}`}>
                   <Briefcase className="w-3 h-3"/> {item['服务对象']}
                </span>
                
                <span className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${item['所属市州单位'].includes('省') ? 'bg-purple-50 text-purple-700 font-medium' : 'bg-gray-100 text-gray-600'}`}>
                   <Building2 className="w-3 h-3"/> {item['所属市州单位']}
                </span>
                
                {item.aiScore > 0.8 && (
                   <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[10px] border border-orange-100">
                     语义{Math.round(item.aiScore*100)}
                   </span>
                )}
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
            placeholder="搜服务..." 
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
