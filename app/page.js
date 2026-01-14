'use client';

import { useState, useMemo } from 'react';
// 假设你的数据文件位于项目根目录的 data/services.js
// 如果路径不同，请根据实际情况调整 '../data/services'
import servicesData from '../data/services'; 

export default function Home() {
  // ---------------------------------------------------------
  // 1. 状态定义
  // ---------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('全部');

  // 城市列表定义
  const cities = [
    '全部', '湖南省', '长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', 
    '岳阳市', '常德市', '张家界市', '益阳市', '郴州市', '永州市', 
    '怀化市', '娄底市', '湘西土家族苗族自治州'
  ];

  // ---------------------------------------------------------
  // 2. 核心算法：智能排序与过滤
  // ---------------------------------------------------------
  const filteredServices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    // === 场景 A: 用户没有输入搜索词 ===
    // 逻辑：严格展示。选中"长沙"时，只看"长沙"+"省级"，屏蔽"株洲"等其他城市。
    if (!term) {
      if (selectedCity === '全部') return servicesData;
      
      return servicesData.filter(service => {
        const isLocal = service.city === selectedCity;
        const isProvincial = service.city === '湖南省' || service.city === '省级';
        return isLocal || isProvincial;
      });
    }

    // === 场景 B: 用户输入了搜索词 (如 "公积金") ===
    // 逻辑：全局搜索 + 权重排序。
    // 即使选了"长沙"，如果"株洲"有匹配结果，也要显示（排在后面），防止漏找。
    
    const scoredData = servicesData.map(service => {
      let score = 0;
      const titleMatch = service.title.toLowerCase().includes(term);
      const descMatch = service.desc.toLowerCase().includes(term);

      // [第一优先级]：关键词匹配 (意图)
      if (titleMatch) score += 100;       // 标题匹配，权重最高
      else if (descMatch) score += 50;    // 描述匹配，权重次之
      else return null;                   // 完全不匹配则剔除

      // [第二优先级]：地理位置权重 (定位)
      if (selectedCity !== '全部') {
        if (service.city === selectedCity) {
          score += 30; // 命中当前选中的城市 -> 优先展示
        } else if (service.city === '湖南省' || service.city === '省级') {
          score += 20; // 命中省级服务 -> 次优先展示
        } else {
          score += 0;  // 命中其他城市 -> 不加分，但依然保留(排在最后)
        }
      } else {
        // 如果选的是“全部”，省级服务稍微优先一点点
        if (service.city === '湖南省' || service.city === '省级') {
          score += 5;
        }
      }

      return { ...service, score };
    });

    // 过滤掉 null (不匹配的)，然后按分数从高到低排序
    return scoredData
      .filter(item => item !== null)
      .sort((a, b) => b.score - a.score);

  }, [searchTerm, selectedCity]);

  // ---------------------------------------------------------
  // 3. 页面渲染 (UI)
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* 顶部导航栏 */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-bold text-xl tracking-tight text-blue-600">
            湘政通 <span className="text-slate-400 text-sm font-normal">智能搜索</span>
          </div>
          <div className="text-xs text-slate-400">
            收录 {servicesData.length} 项服务
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-8">
        
        {/* 头部介绍 */}
        <div className="text-center py-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">
            湖南省政务服务一键直达
          </h1>
          <p className="text-slate-500">
            {selectedCity === '全部' 
              ? '正在搜索全省范围内的政务服务' 
              : `当前定位：${selectedCity}（含省级服务）`}
          </p>
        </div>

        {/* 搜索控制区 */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 sticky top-20 z-10">
          <div className="flex flex-col md:flex-row gap-3">
            {/* 城市下拉框 */}
            <div className="relative md:w-1/3">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
              >
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              {/* 自定义下拉箭头图标 */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            {/* 搜索输入框 */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 py-3 pl-11 pr-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 transition-all"
                placeholder="搜索服务，如：社保、公积金、身份证..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 结果列表区 */}
        <div className="space-y-3">
          {filteredServices.length > 0 ? (
            filteredServices.map((service, index) => (
              <a
                key={index}
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl p-5 transition-all duration-200 relative overflow-hidden">
                  
                  {/* 标签逻辑：高亮显示当前定位和省级 */}
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700 pr-16">
                      {service.title}
                    </h3>
                    
                    <span className={`
                      text-xs font-semibold px-2.5 py-1 rounded-md absolute top-4 right-4
                      ${service.city === selectedCity ? 'bg-blue-100 text-blue-700' : 
                        (service.city === '湖南省' || service.city === '省级') ? 'bg-indigo-50 text-indigo-600' : 
                        'bg-slate-100 text-slate-500'}
                    `}>
                      {service.city}
                    </span>
                  </div>

                  <p className="text-sm text-slate-500 group-hover:text-slate-600 line-clamp-2">
                    {service.desc}
                  </p>
                  
                  {/* 调试辅助：如果想看分数可以解开下面这行注释 */}
                  {/* {service.score && <div className="text-xs text-red-500 mt-2">匹配分: {service.score}</div>} */}
                </div>
              </a>
            ))
          ) : (
            <div className="text-center py-16">
              <div className="inline-block p-4 rounded-full bg-slate-100 mb-4">
                <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <p className="text-slate-500 text-lg">没有找到相关服务</p>
              <p className="text-slate-400 text-sm mt-1">请尝试更换关键词或切换城市范围</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
