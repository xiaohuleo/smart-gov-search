'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Search, Settings, User, Zap, Save, AlertCircle } from 'lucide-react';

// 预设的一些模型配置，方便你演示时一键切换
const PRESETS = {
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama3-70b-8192',
    note: '速度最快，演示首选'
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com', // 或者是 deepseek 的 openai 兼容地址
    model: 'deepseek-chat',
    note: '中文理解能力极强'
  },
  moonshot: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    note: '长文本友好'
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    model: '',
    note: '任意兼容接口'
  }
};

export default function Home() {
  // --- 数据与状态 ---
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchTime, setSearchTime] = useState(0); // 记录搜索耗时
  
  // --- 搜索上下文 ---
  const [query, setQuery] = useState('');
  const [userRole, setUserRole] = useState('自然人');
  const [location, setLocation] = useState('长沙市');
  const [channel, setChannel] = useState('Android');
  const [useSatisfaction, setUseSatisfaction] = useState(false);
  const [useHotness, setUseHotness] = useState(true);

  // --- API 配置 (默认加载 Groq 预设) ---
  const [configOpen, setConfigOpen] = useState(true); // 默认展开配置面板
  const [apiConfig, setApiConfig] = useState({
    baseUrl: PRESETS.groq.baseUrl,
    apiKey: '',
    model: PRESETS.groq.model
  });

  // 从本地缓存加载 API Key (避免刷新丢失)
  useEffect(() => {
    const savedKey = localStorage.getItem('gov_search_api_key');
    const savedBase = localStorage.getItem('gov_search_base_url');
    if (savedKey) setApiConfig(prev => ({ ...prev, apiKey: savedKey }));
    if (savedBase) setApiConfig(prev => ({ ...prev, baseUrl: savedBase }));
  }, []);

  // 切换预设
  const applyPreset = (key) => {
    const p = PRESETS[key];
    setApiConfig(prev => ({
      ...prev,
      baseUrl: p.baseUrl,
      model: p.model
    }));
  };

  // 保存配置
  const saveConfig = () => {
    localStorage.setItem('gov_search_api_key', apiConfig.apiKey);
    localStorage.setItem('gov_search_base_url', apiConfig.baseUrl);
    setConfigOpen(false);
    alert('配置已保存到本地浏览器');
  };

  // --- 逻辑处理 ---
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
    if (!apiConfig.apiKey) {
      alert('请先在配置面板输入 API Key');
      setConfigOpen(true);
      return;
    }
    if (csvData.length === 0) return alert('请先导入 CSV');
    if (!query.trim()) return alert('请输入搜索词');

    setLoading(true);
    setResults([]);
    const startTime = performance.now();

    try {
      // 1. 前端粗筛
      const preFiltered = csvData.filter(item => {
        if (item['发布渠道'] && !item['发布渠道'].includes(channel)) return false;
        if (item['服务对象']) {
            if (userRole === '自然人' && !item['服务对象'].includes('自然人')) return false;
            if (userRole === '法人' && !item['服务对象'].includes('法人') && !item['服务对象'].includes('企业')) return false;
        }
        return true;
      });

      // 2. 调用后端 API (后端只是一个代理，防止CORS问题)
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          items: preFiltered,
          context: { userRole, location, useSatisfaction, useHotness },
          config: apiConfig // 把配置传给后端
        })
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);

    } catch (error) {
      console.error(error);
      alert('搜索失败: ' + error.message);
    } finally {
      const endTime = performance.now();
      setSearchTime(((endTime - startTime) / 1000).toFixed(2)); // 计算耗时(秒)
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto min-h-screen bg-white shadow-xl flex flex-col font-sans">
      {/* 顶部导航 */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20">
        <div>
          <h1 className="font-bold text-lg">政务智能搜索 Demo</h1>
          <p className="text-xs text-slate-400">基于大模型语义理解</p>
        </div>
        <button onClick={() => setConfigOpen(!configOpen)} className="p-2 hover:bg-slate-700 rounded-full transition">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 配置面板 (可折叠) */}
      {configOpen && (
        <div className="bg-slate-100 p-4 border-b border-slate-200 text-sm space-y-3 animate-in slide-in-from-top-2">
          <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => applyPreset(key)} 
                className={`px-3 py-1.5 rounded-full whitespace-nowrap border ${apiConfig.baseUrl === p.baseUrl ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'}`}>
                {p.name}
              </button>
            ))}
          </div>
          
          <div className="grid gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">API Base URL</label>
              <input type="text" value={apiConfig.baseUrl} onChange={e => setApiConfig({...apiConfig, baseUrl: e.target.value})} 
                className="w-full p-2 border rounded font-mono text-xs" placeholder="https://api.openai.com/v1" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Model Name</label>
              <input type="text" value={apiConfig.model} onChange={e => setApiConfig({...apiConfig, model: e.target.value})} 
                className="w-full p-2 border rounded font-mono text-xs" placeholder="gpt-3.5-turbo" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">API Key (仅本地存储)</label>
              <input type="password" value={apiConfig.apiKey} onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})} 
                className="w-full p-2 border rounded font-mono text-xs" placeholder="sk-..." />
            </div>
            <button onClick={saveConfig} className="w-full bg-slate-800 text-white py-2 rounded flex justify-center items-center gap-2 hover:bg-slate-700">
              <Save className="w-4 h-4" /> 保存并收起配置
            </button>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* 数据导入 */}
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-blue-900 text-sm">导入服务事项数据</h3>
            <p className="text-xs text-blue-600">支持 CSV 格式文件</p>
          </div>
          <label className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm cursor-pointer hover:bg-blue-700 transition flex items-center gap-2">
            <Upload className="w-4 h-4" /> 选择文件
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* 模拟用户画像 */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
            <User className="w-4 h-4" /> 上下文模拟
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <select value={userRole} onChange={e => setUserRole(e.target.value)} className="p-2 border rounded text-sm bg-white">
              <option value="自然人">自然人</option>
              <option value="法人">法人 (企业)</option>
            </select>
            <select value={channel} onChange={e => setChannel(e.target.value)} className="p-2 border rounded text-sm bg-white">
              <option value="Android">Android</option>
              <option value="IOS">IOS</option>
              <option value="HarmonyOS">HarmonyOS</option>
              <option value="微信小程序">微信小程序</option>
              <option value="支付宝小程序">支付宝小程序</option>
            </select>
          </div>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="当前定位，如：长沙市" />
          
          <div className="flex gap-4 pt-2">
             <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
               <input type="checkbox" checked={useSatisfaction} onChange={e => setUseSatisfaction(e.target.checked)} />
               <span>启用满意度加权</span>
             </label>
             <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
               <input type="checkbox" checked={useHotness} onChange={e => setUseHotness(e.target.checked)} />
               <span>优先高频事项</span>
             </label>
          </div>
        </div>

      </div>

      {/* 底部搜索栏 (吸底) */}
      <div className="p-4 bg-white border-t space-y-4">
        {results.length > 0 && (
           <div className="text-xs text-slate-400 flex justify-between px-1">
             <span>找到 {results.length} 个结果</span>
             <span className="flex items-center gap-1 text-green-600"><Zap className="w-3 h-3"/> 耗时 {searchTime}s</span>
           </div>
        )}
        
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="我想办理..." 
              className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
          </div>
          <button 
            onClick={handleSearch} 
            disabled={loading}
            className="bg-blue-600 text-white px-6 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? '...' : '搜索'}
          </button>
        </div>

        {/* 结果列表 */}
        <div className="space-y-3 max-h-[40vh] overflow-y-auto">
          {results.map((item, idx) => (
            <div key={idx} className="p-3 border border-slate-100 rounded-xl shadow-sm bg-white hover:border-blue-300 transition group">
              <div className="flex justify-between items-start">
                <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                <div className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-mono">
                  {(item.score * 100).toFixed(0)}%
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</div>
              {item.reason && (
                <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 p-2 rounded flex items-start gap-1">
                  <span className="font-bold">AI:</span> {item.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
