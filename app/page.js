'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Search, Loader2, Settings, User, MapPin, Smartphone, ThumbsUp, BarChart3 } from 'lucide-react';

export default function Home() {
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState(''); // analyzing, ranking...
  const [results, setResults] = useState([]);
  
  // 上下文设置
  const [query, setQuery] = useState('');
  const [userRole, setUserRole] = useState('自然人'); // 自然人, 法人
  const [location, setLocation] = useState('省公安厅'); // 模拟定位/部门
  const [channel, setChannel] = useState('Android'); // Android, iOS, Web
  const [useSatisfaction, setUseSatisfaction] = useState(false); // 满意度排序开关
  const [useHotness, setUseHotness] = useState(true); // 是否利用高频事项排序
  const [fileName, setFileName] = useState('');

  // 处理文件上传
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setFileName(file.name);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("CSV Parsed:", results.data);
        setCsvData(results.data);
        alert(`成功导入 ${results.data.length} 条服务数据`);
      },
      error: (error) => {
        alert('解析CSV失败: ' + error.message);
      }
    });
  };

  // 执行智能搜索
  const handleSearch = async () => {
    if (csvData.length === 0) {
      alert('请先上传CSV数据文件');
      return;
    }
    if (!query.trim()) {
      alert('请输入搜索内容');
      return;
    }

    setLoading(true);
    setSearchStatus('正在分析用户意图...');
    setResults([]);

    try {
      // 1. 本地硬过滤 (规则引擎)
      // 这里的字段名必须和CSV表头一致
      const preFiltered = csvData.filter(item => {
        // 渠道过滤 (如果CSV里有'发布渠道'字段)
        if (item['发布渠道'] && !item['发布渠道'].includes(channel)) return false;
        
        // 对象过滤 (如果CSV里有'服务对象'字段)
        // 逻辑：如果我是自然人，事项必须包含自然人；如果我是法人，事项必须包含法人
        if (item['服务对象']) {
            if (userRole === '自然人' && !item['服务对象'].includes('自然人')) return false;
            if (userRole === '法人' && !item['服务对象'].includes('法人') && !item['服务对象'].includes('企业')) return false;
        }

        // 定位过滤 (简单模拟：如果事项是市级事项，需匹配城市)
        // 实际逻辑会更复杂，这里仅作演示：不做强制过滤，而是交给大模型降权
        return true; 
      });

      setSearchStatus(`筛选出 ${preFiltered.length} 条符合渠道和身份的数据，正在进行大模型语义匹配...`);

      // 2. 调用后端 API 进行 AI 排序
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          items: preFiltered, // 发送预筛选的数据
          context: {
            userRole,
            location,
            useSatisfaction,
            useHotness
          }
        })
      });

      if (!response.ok) throw new Error('API请求失败');
      
      const data = await response.json();
      setResults(data.results);

    } catch (error) {
      console.error(error);
      alert('搜索出错，请检查API Key或网络');
    } finally {
      setLoading(false);
      setSearchStatus('');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen shadow-lg flex flex-col">
      {/* 头部 */}
      <div className="bg-blue-600 p-4 text-white">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5" /> 智慧政务搜索 Demo
        </h1>
        <p className="text-xs text-blue-100 mt-1">基于 Google Gemini 大模型构建</p>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {/* 1. 数据源设置 */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h2 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4" /> 第一步：导入数据源 (CSV)
          </h2>
          <label className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer">
            <input type="file" accept=".csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500"/>
          </label>
          {fileName && <p className="text-xs text-green-600 mt-2">已加载: {fileName}</p>}
        </div>

        {/* 2. 上下文模拟设置 */}
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <User className="w-4 h-4" /> 第二步：模拟用户上下文
          </h2>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">用户角色</label>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} className="w-full p-2 border rounded text-sm bg-white">
                <option value="自然人">自然人 (个人)</option>
                <option value="法人">法人 (企业)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">当前设备/渠道</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full p-2 border rounded text-sm bg-white">
                <option value="Android">Android App</option>
                <option value="iOS">iOS App</option>
                <option value="HarmonyOS">HarmonyOS</option>
                <option value="Web">Web 网页</option>
              </select>
            </div>
          </div>

          <div>
             <label className="text-xs text-gray-500 mb-1 block">模拟定位/所在部门</label>
             <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="例如：省公安厅 或 长沙市"/>
          </div>

          <div className="flex gap-4 mt-2">
            <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={useSatisfaction} onChange={e => setUseSatisfaction(e.target.checked)} className="rounded text-blue-600"/>
              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3"/> 启用满意度加权</span>
            </label>
            <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={useHotness} onChange={e => setUseHotness(e.target.checked)} className="rounded text-blue-600"/>
              <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3"/> 优先高频事项</span>
            </label>
          </div>
        </div>

        {/* 3. 搜索区域 */}
        <div className="sticky top-0 bg-white py-2 z-10 border-b mb-4">
          <div className="relative">
            <input 
              type="text" 
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="请输入您想办理的业务，如：身份证丢了" 
              className="w-full p-3 pl-10 border-2 border-blue-500 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <Search className="absolute left-3 top-3.5 text-blue-500 w-5 h-5" />
            <button 
              onClick={handleSearch}
              disabled={loading}
              className="absolute right-1 top-1 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? '搜索中' : '搜索'}
            </button>
          </div>
          {searchStatus && <p className="text-xs text-blue-500 mt-2 text-center animate-pulse">{searchStatus}</p>}
        </div>

        {/* 4. 结果展示 */}
        <div className="space-y-3 pb-8">
          {results.length === 0 && !loading && (
            <div className="text-center text-gray-400 py-10">
              <p>暂无搜索结果</p>
              <p className="text-xs mt-1">请上传CSV并输入关键词</p>
            </div>
          )}

          {results.map((item, index) => (
            <div key={item.code} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors bg-white shadow-sm border-l-4 border-l-blue-500">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-800 text-sm">{item.name}</h3>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                  匹配度: {Math.round(item.score * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
              
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600">编码: {item.code}</span>
                {item.reason && <span className="text-[10px] bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200">AI推荐: {item.reason}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
