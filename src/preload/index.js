import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // 자산 그룹
  assetGroups: {
    getAll: () => ipcRenderer.invoke('asset-groups:getAll'),
    create: (name) => ipcRenderer.invoke('asset-groups:create', name),
    update: (id, name) => ipcRenderer.invoke('asset-groups:update', id, name),
    delete: (id) => ipcRenderer.invoke('asset-groups:delete', id),
    reorder: (orderedIds) => ipcRenderer.invoke('asset-groups:reorder', orderedIds),
  },

  // 자산
  assets: {
    getAll: () => ipcRenderer.invoke('assets:getAll'),
    create: (data) => ipcRenderer.invoke('assets:create', data),
    update: (id, data) => ipcRenderer.invoke('assets:update', id, data),
    delete: (id) => ipcRenderer.invoke('assets:delete', id),
    reorder: (groupId, orderedIds) => ipcRenderer.invoke('assets:reorder', groupId, orderedIds),
    move: (assetId, targetGroupId, sourceOrderedIds, targetOrderedIds) =>
      ipcRenderer.invoke('assets:move', assetId, targetGroupId, sourceOrderedIds, targetOrderedIds),
  },

  // 카테고리
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    create: (data) => ipcRenderer.invoke('categories:create', data),
    update: (id, data) => ipcRenderer.invoke('categories:update', id, data),
    delete: (id) => ipcRenderer.invoke('categories:delete', id),
    reorder: (orderedIds) => ipcRenderer.invoke('categories:reorder', orderedIds),
  },

  // 거래 내역
  transactions: {
    getByMonth: (data) => ipcRenderer.invoke('transactions:getByMonth', data),
    search: (data) => ipcRenderer.invoke('transactions:search', data),
    update: (id, data) => ipcRenderer.invoke('transactions:update', id, data),
    delete: (id) => ipcRenderer.invoke('transactions:delete', id),
    create: (data) => ipcRenderer.invoke('transactions:create', data),
    uncategorizedCount: () => ipcRenderer.invoke('transactions:uncategorizedCount'),
    getMonths: (data) => ipcRenderer.invoke('transactions:getMonths', data),
  },

  // 키워드 규칙
  keywordRules: {
    getAll: () => ipcRenderer.invoke('keyword-rules:getAll'),
    create: (data) => ipcRenderer.invoke('keyword-rules:create', data),
    update: (id, data) => ipcRenderer.invoke('keyword-rules:update', id, data),
    delete: (id) => ipcRenderer.invoke('keyword-rules:delete', id),
    reorder: (orderedIds) => ipcRenderer.invoke('keyword-rules:reorder', orderedIds),
  },

  // 파서 템플릿
  parserTemplates: {
    getAll: () => ipcRenderer.invoke('parser-templates:getAll'),
    create: (data) => ipcRenderer.invoke('parser-templates:create', data),
    update: (id, data) => ipcRenderer.invoke('parser-templates:update', id, data),
    delete: (id) => ipcRenderer.invoke('parser-templates:delete', id),
  },

  // 엑셀 가져오기
  excel: {
    openFile: () => ipcRenderer.invoke('excel:openFile'),
    listDetectedFiles: () => ipcRenderer.invoke('excel:listDetectedFiles'),
    getImportHistory: (data) => ipcRenderer.invoke('excel:getImportHistory', data),
    getDroppedFilePath: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    parse: (data) => ipcRenderer.invoke('excel:parse', data),
    save: (data) => ipcRenderer.invoke('excel:save', data),
  },

  dashboard: {
    getStats: (data) => ipcRenderer.invoke('dashboard:getStats', data),
  },

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    delete: (key) => ipcRenderer.invoke('settings:delete', key),
  },

  fonts: {
    getInstalled: () => ipcRenderer.invoke('fonts:getInstalled'),
  },

  googleSheets: {
    selectServiceAccountFile: () => ipcRenderer.invoke('google-sheets:selectServiceAccountFile'),
    testConnection: (data) => ipcRenderer.invoke('google-sheets:testConnection', data),
    getSpreadsheetMeta: (data) => ipcRenderer.invoke('google-sheets:getSpreadsheetMeta', data),
  },

  sync: {
    getOverview: () => ipcRenderer.invoke('sync:getOverview'),
    getHistory: (data) => ipcRenderer.invoke('sync:getHistory', data),
    getActiveRun: () => ipcRenderer.invoke('sync:getActiveRun'),
    startRun: (data) => ipcRenderer.invoke('sync:startRun', data),
  },

  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import'),
    getResetPreview: () => ipcRenderer.invoke('backup:getResetPreview'),
    resetData: (payload) => ipcRenderer.invoke('backup:resetData', payload),
  },

  app: {
    setThemeSource: (themeSource) => ipcRenderer.invoke('app:setThemeSource', themeSource),
  },
})
