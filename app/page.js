'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Settings, User, Zap, Save, MapPin, Briefcase } from 'lucide-react';

// 🚀 速度优化配置：使用 8b 小模型，速度快 10 倍
const PRESETS = {
  groq: { 
    name: 'Groq (极速/推荐)', 
    baseUrl: 'https://api.groq.com/openai/v1', 
    model: 'llama3-8b-8192' // 改用 8b 模型，闪电速度
  },
  deepseek: { 
    name: 'DeepSeek', 
    baseUrl: 'https://api.deepseek.com', 
    model: 'deepseek-chat' 
  },
  custom: { name: '自定义', baseUrl: '', model: '' }
};

export default function Home() {
  // --- 数据与状态 ---
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchTime, setSearchTime] = useState(0);
  const [debugMsg, setDebugMsg] = useState('');
  
  // --- 用户上下文 ---
  const [query, setQuery] = useState('');
  const [userRole, setUserRole] = useState('自然人');
  const [location, setLocation] = useState('株洲市');
  const [channel, setChannel] = useState('IOS');
  const [useSatisfaction, setUseSatisfaction] = useState(false);

  // --- API 配置 ---
  const [configOpen, setConfigOpen] = useState(true);
  const [apiConfig, setApiConfig] = useState({ 
    baseUrl: PRESETS.groq.baseUrl, 
    apiKey: '', 
    model: PRESETS.groq.model 
  });

  useEffect(() => {
    const savedKey = localStorage.getItem('gov_search_api_key');
    const savedBase = localStorage.getItem('gov_search_base_url');
    const savedModel = localStorage.getItem('gov_search_model');
    
    if (savedKey) setApiConfig(prev => ({ ...prev, apiKey: savedKey }));
    if (savedBase) setApiConfig(prev => ({ ...prev, baseUrl: savedBase }));
    if (savedModel) setApiConfig(prev => ({ ...prev, model: savedModel }));
  }, []);

  const saveConfig = () => {
    localStorage.setItem('gov_search_api_key', apiConfig.apiKey);
    localStorage.setItem('gov_search_base_url', apiConfig.baseUrl);
    localStorage.setItem('gov_search_model', apiConfig.model);
    setConfigOpen(false);
    alert('配置已保存 (前端直连模式)');
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

  // 🔥 核心极速搜索逻辑
  const handleSearch = async () => {
    if (!apiConfig.apiKey) return alert('请先配置 API Key');
    if (csvData.length === 0) return alert('请先导入 CSV');
    if (!query.trim()) return alert('请输入搜索词');

    setLoading(true);
    setResults([]);
    setDebugMsg('正在本地预筛选...');
    const startTime = performance.now();

    try {
      // 1. 本地硬过滤：渠道 (Channel Firewall)
      // 这一步在浏览器本地瞬间完成
      const channelFiltered = csvData.filter(item => {
        const itemChannels = item['发布渠道'] || "";
        const channels = itemChannels.split(/[,，;]/).map(c => c.trim().toUpperCase());
        const userChannel = channel.toUpperCase();
        return channels.length === 0 || channels.includes(userChannel);
      });

      // 2. 数据瘦身 (Payload Reduction)
      // 只取前 50 条，且只发 ID 和 名称 给 AI，极大减少 token 消耗
      const candidates = channelFiltered.slice(0, 50).map(item => ({
        id: item['事项编码'],
        n: item['事项名称'] // 只发名称，不发描述
      }));

      // 3. 极速 AI 请求 (Direct Fetch)
      // 直接从浏览器发给 Groq，不走 Vercel 后端
      setDebugMsg('正在请求 AI 模型...');
      
      const systemPrompt = `你是一个相关性评分器。用户搜索: "${query}"。
      请给以下列表中的每一项打分(0-1)，判断其与搜索词的语义相关性。
      必须返回纯 JSON 对象，格式: {"results": [{"id":"编码", "s":0.9}]}。不要解释。`;

      const apiUrl = `${apiConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(candidates) }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" } // 强制 JSON
        })
      });

      if (!apiRes.ok) {
        throw new Error(`API Error: ${apiRes.status}`);
      }

      const apiJson = await apiRes.json();
      const content = apiJson.choices[0].message.content;
      
      // 4. 解析结果
      let aiScoresMap = {};
      try {
        const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanContent);
        const list = Array.isArray(parsed) ? parsed : (parsed.results || []);
        list.forEach(p => aiScoresMap[p.id] = p.s);
      } catch (e) {
        console.error("AI Parse Error", e);
      }

      // 5. 本地混合排序 (Hybrid Sorting)
      setDebugMsg('正在本地排序...');
      const finalResults = channelFiltered.map(item => {
        const code = item['事项编码'];
        const aiScore = aiScoresMap[code] || 0;

        // 角色匹配 (权重 10000)
        const itemTargets = (item['服务对象'] || "").split(/[,，;]/).map(t => t.trim());
        const isRoleMatch = itemTargets.some(t => t.includes(userRole));
        const roleScore = isRoleMatch ? 10000 : 0;

        // 定位匹配 (权重 100)
        const itemDept = item['所属市州单位'] || "";
        const isLocMatch = itemDept.includes(location) || itemDept.includes("省");
        const locScore = isLocMatch ? 100 : 0;

        // 语义分数 (放大 10 倍)
        const semanticScore = aiScore * 10;

        // 满意度加权
        let extraScore = 0;
        if (useSatisfaction && item['满意度']) {
          extraScore += parseFloat(item['满意度']);
        }

        return {
          ...item,
          aiScore: aiScore,
          isRoleMatch: isRoleMatch,
          totalScore: roleScore + locScore + semanticScore + extraScore
        };
      });

      // 排序并过滤掉低分噪音
      const sorted = finalResults
        .filter(i => i.aiScore > 0.01 || i.totalScore > 1000)
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
    <div className="max-w-2xl mx-auto min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* 顶部栏 */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div>
          <h1 className="font-bold text-lg">政务严选搜索 V4.0 (极速版)</h1>
          <p className="text-xs text-slate-400">前端直连 Groq / 纯本地逻辑过滤</p>
        </div>
        <button onClick={() => setConfigOpen(!configOpen)} className="p-2 hover:bg-slate-700 rounded-full">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 配置面板 */}
      {configOpen && (
        <div className="bg-white p-4 border-b space-y-3 shadow-inner animate-in slide-in-from-top-2">
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => setApiConfig({...apiConfig, baseUrl: p.baseUrl, model: p.model})} 
                className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${apiConfig.baseUrl === p.baseUrl ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}>
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
            <Save className="w-4 h-4" /> 保存并生效
          </button>
        </div>
      )}

      <div className="p-4 space-y-4 flex-1">
        {/* 数据导入 & 上下文 */}
        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2 border-b">
            <span className="text-sm font-bold flex items-center gap-2"><Settings className="w-4 h-4"/> 模拟环境</span>
            <label className="text-blue-600 text-xs cursor-pointer flex items-center gap-1 hover:underline">
              <Upload className="w-3 h-3" /> 导入CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">渠道 (严格过滤)</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="Android">Android</option>
                <option value="IOS">iOS</option>
                <option value="HarmonyOS">HarmonyOS</option>
                <option value="微信小程序">微信小程序</option>
                <option value="支付宝小程序">支付宝小程序</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">角色 (优先排序)</label>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} className="w-full p-2 border rounded text-sm bg-gray-50">
                <option value="自然人">自然人</option>
                <option value="法人">法人</option>
              </select>
            </div>
          </div>
          
          <div className="relative">
            <MapPin className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full pl-8 p-2 border rounded text-sm" />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 pt-1">
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
            <div key={idx} className="bg-white border rounded-lg p-3 shadow-sm hover:border-blue-400 transition relative overflow-hidden">
              <div className={`absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold rounded-bl-lg 
                ${item.isRoleMatch ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {item.isRoleMatch ? '角色匹配' : '其他角色'}
              </div>

              <h3 className="font-bold text-gray-800 text-sm pr-16">{item['事项名称']}</h3>
              
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] flex items-center gap-1">
                   <Briefcase className="w-3 h-3"/> {item['服务对象']}
                </span>
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] flex items-center gap-1">
                   <MapPin className="w-3 h-3"/> {item['所属市州单位']}
                </span>
                {item.aiScore > 0.5 && (
                  <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[10px]">
                     AI相关度高
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部搜索框 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-10 max-w-2xl mx-auto">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜服务..." 
            className="flex-1 p-3 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={handleSearch} disabled={loading} className="bg-blue-600 text-white px-6 rounded-xl font-bold text-sm min-w-[80px]">
            {loading ? '...' : '搜索'}
          </button>
        </div>
      </div>
    </div>
  );
}
