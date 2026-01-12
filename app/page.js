'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Search, Settings, User, Zap, Save, Smartphone, MapPin, Briefcase } from 'lucide-react';

// API 预设配置
const PRESETS = {
  groq: { name: 'Groq (极速/推荐)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama3-70b-8192' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  moonshot: { name: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  custom: { name: '自定义', baseUrl: '', model: '' }
};

export default function Home() {
  // --- 数据与状态 ---
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchTime, setSearchTime] = useState(0);
  
  // --- 用户上下文 ---
  const [query, setQuery] = useState('');
  const [userRole, setUserRole] = useState('自然人'); // 自然人, 法人
  const [location, setLocation] = useState('株洲市'); // 模拟定位
  const [channel, setChannel] = useState('IOS'); // 注意：CSV里通常是 IOS 大写
  const [useSatisfaction, setUseSatisfaction] = useState(false);

  // --- API 配置 ---
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
      // 调用后端混合引擎
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          items: csvData, // 发送全量数据，让后端做严格过滤
          context: { userRole, location, channel, useSatisfaction },
          config: apiConfig
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);

    } catch (error) {
      console.error(error);
      alert('搜索异常: ' + error.message);
    } finally {
      const endTime = performance.now();
      setSearchTime(((endTime - startTime) / 1000).toFixed(2));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* 顶部配置栏 */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div>
          <h1 className="font-bold text-lg">政务严选搜索 V3.0</h1>
          <p className="text-xs text-slate-400">严格渠道过滤 + 角色绝对排序</p>
        </div>
        <button onClick={() => setConfigOpen(!configOpen)} className="p-2 hover:bg-slate-700 rounded-full">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 配置面板 */}
      {configOpen && (
        <div className="bg-white p-4 border-b space-y-3 shadow-inner">
          <div className="flex gap-2 mb-2">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => setApiConfig({...apiConfig, baseUrl: p.baseUrl, model: p.model})} 
                className={`px-3 py-1 text-xs rounded-full border ${apiConfig.baseUrl === p.baseUrl ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                {p.name}
              </button>
            ))}
          </div>
          <input type="password" value={apiConfig.apiKey} onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})} 
            className="w-full p-2 border rounded text-xs" placeholder="在此输入 API Key (如 sk-...)" />
          <button onClick={saveConfig} className="w-full bg-slate-800 text-white py-2 rounded text-xs flex justify-center gap-2">
            <Save className="w-4 h-4" /> 保存配置
          </button>
        </div>
      )}

      <div className="p-4 space-y-4 flex-1">
        {/* 数据源 */}
        <div className="bg-white p-4 rounded-lg border flex justify-between items-center shadow-sm">
          <div className="text-sm font-medium text-gray-700">数据源 (.csv)</div>
          <label className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded text-xs cursor-pointer hover:bg-blue-100 flex items-center gap-1">
            <Upload className="w-3 h-3" /> 导入数据
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* 严格上下文模拟 */}
        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800 border-b pb-2">
            <User className="w-4 h-4" /> 用户环境模拟
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">当前设备 (严格过滤)</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="Android">Android</option>
                <option value="IOS">iOS</option>
                <option value="HarmonyOS">HarmonyOS</option>
                <option value="微信小程序">微信小程序</option>
                <option value="支付宝小程序">支付宝小程序</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">用户角色 (绝对排序)</label>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="自然人">自然人 (个人)</option>
                <option value="法人">法人 (企业)</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="text-xs text-gray-500 block mb-1">定位 / 所在市州</label>
            <div className="relative">
              <MapPin className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full pl-8 p-2 border rounded text-sm" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 pt-1">
             <input type="checkbox" checked={useSatisfaction} onChange={e => setUseSatisfaction(e.target.checked)} />
             启用满意度加权
          </label>
        </div>

        {/* 结果列表 */}
        {results.length > 0 && (
          <div className="text-xs text-gray-500 flex justify-between px-1">
            <span>匹配结果: {results.length} 条</span>
            <span className="text-green-600 font-mono">{searchTime}s</span>
          </div>
        )}

        <div className="space-y-3 pb-20">
          {results.map((item, idx) => (
            <div key={idx} className="bg-white border rounded-lg p-3 shadow-sm hover:border-blue-400 transition relative overflow-hidden">
              {/* 排序标签 */}
              <div className={`absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold rounded-bl-lg 
                ${item.sortTags.includes('角色匹配') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {item.sortTags}
              </div>

              <h3 className="font-bold text-gray-800 text-sm pr-16">{item.name}</h3>
              
              <div className="flex flex-wrap gap-2 mt-2 mb-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                   <Briefcase className="w-3 h-3"/> {item.target}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                   <MapPin className="w-3 h-3"/> {item.dept}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[10px]">
                   语义分: {Math.round(item.aiScore * 100)}
                </span>
              </div>
              
              {item.reason && (
                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100">
                  <span className="font-bold text-blue-600">AI: </span>{item.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 底部搜索框 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-10 max-w-2xl mx-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="请输入服务名称..." 
            className="flex-1 p-3 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
          <button onClick={handleSearch} disabled={loading} className="bg-blue-600 text-white px-6 rounded-xl font-bold text-sm">
            {loading ? <Zap className="w-5 h-5 animate-spin"/> : '搜索'}
          </button>
        </div>
      </div>
    </div>
  );
}
