'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Settings, Zap, Save, MapPin, Briefcase, Building2, Terminal } from 'lucide-react';

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
  
  // 屏幕日志系统 (用于诊断问题)
  const [logs, setLogs] = useState(['等待操作...']);
  
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
    console.log(`[${time}] ${msg}`);
  };

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
    addLog('配置已保存到本地');
    alert('配置已保存');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    addLog(`正在读取文件: ${file.name}`);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setCsvData(res.data);
        addLog(`CSV读取成功: 获取到 ${res.data.length} 条数据`);
        alert(`成功导入 ${res.data.length} 条数据`);
      },
      error: (err) => {
        addLog(`CSV读取失败: ${err.message}`);
        alert('CSV读取失败');
      }
    });
  };

  // 核心搜索逻辑 (增加详细诊断)
  const handleSearch = async () => {
    addLog('>>> 开始搜索流程');
    
    // 1. 基础检查
    if (!apiConfig.apiKey) {
      addLog('错误: 未配置 API Key');
      return alert('请先配置 API Key');
    }
    if (csvData.length === 0) {
      addLog('错误: CSV 数据为空');
      return alert('请先导入 CSV');
    }
    if (!query.trim()) {
      addLog('错误: 搜索词为空');
      return alert('请输入搜索词');
    }

    setLoading(true);
    setResults([]);
    const startTime = performance.now();

    try {
      // 2. 渠道过滤
      addLog(`正在执行渠道过滤 (当前设备: ${channel})`);
      const channelFiltered = csvData.filter(item => {
        const itemChannels = item['发布渠道'] || "";
        const channels = itemChannels.split(/[,，;]/).map(c => c.trim().toUpperCase());
        const userChannel = channel.toUpperCase();
        // 如果数据没填渠道，默认显示；否则必须包含当前渠道
        return channels.length === 0 || channels.includes(userChannel);
      });
      addLog(`渠道过滤后剩余: ${channelFiltered.length} 条`);

      if (channelFiltered.length === 0) {
        addLog('警告: 当前设备渠道下没有可展示的事项，流程终止');
        setLoading(false);
        return;
      }

      // 3. AI 意图识别
      addLog('正在请求后端 API 进行语义分析...');
      const candidates = channelFiltered.slice(0, 50).map(item => ({
        id: item['事项编码'],
        n: item['事项名称']
      }));

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, candidates, config: apiConfig })
      });

      addLog(`后端响应状态码: ${response.status}`);
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`API报错: ${data.error}`);
      }
      
      const aiScoresMap = data.scores || {};
      const scoreKeys = Object.keys(aiScoresMap);
      addLog(`AI评分完成，获取到 ${scoreKeys.length} 个评分结果`);

      // 4. 排序逻辑
      addLog('正在计算最终权重...');
      
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

      // 排序 - 移除过滤门槛，确保有结果显示
      const sorted = finalResults.sort((a, b) => b.totalScore - a.totalScore);
      
      addLog(`排序完成，准备展示 ${sorted.length} 条结果`);
      setResults(sorted);

    } catch (error) {
      addLog(`!!! 发生异常: ${error.message}`);
      alert('搜索中断: ' + error.message);
      console.error(error);
    } finally {
      const endTime = performance.now();
      setSearchTime(((endTime - startTime) / 1000).toFixed(2));
      setLoading(false);
      addLog('>>> 流程结束');
    }
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-gray-50 flex flex-col font-sans text-slate-800 pb-32">
      {/* 顶部栏 */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div>
          <h1 className="font-bold text-lg">政务搜索 V8.0 (诊断版)</h1>
          <p className="text-xs text-slate-400">已启用全链路日志</p>
        </div>
        <button onClick={() => setConfigOpen(!configOpen)} className="p-2 hover:bg-slate-700 rounded-full">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 诊断日志面板 (新增) */}
      <div className="bg-black text-green-400 p-2 text-[10px] font-mono h-32 overflow-y-auto border-b border-gray-700">
        <div className="flex items-center gap-2 mb-1 text-white font-bold border-b border-gray-800 pb-1">
          <Terminal className="w-3 h-3" /> 系统日志 (Debug Log)
        </div>
        {logs.map((log, i) => (
          <div key={i} className="whitespace-nowrap">{log}</div>
        ))}
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
        
        {loading && <div className="text-center text-xs text-blue-600 animate-pulse">正在处理中...</div>}

        <div className="space-y-3">
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
              
              <div className="mt-2 pt-2 border-t border-dashed border-gray-100 text-[9px] text-gray-400 font-mono">
                总分: {item.totalScore.toFixed(0)} | AI:{item.aiScore.toFixed(2)}
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
