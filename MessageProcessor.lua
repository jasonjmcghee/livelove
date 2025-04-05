local socket = require("socket")

-- message_processor.lua
local MessageProcessor = {
    batch_size = 100,
    messages = {},
    message_count = 0,
    last_time = nil
}

function MessageProcessor:new(opts)
    opts = opts or {}
    local processor = setmetatable({}, { __index = self })
    processor.batch_size = opts.batch_size or self.batch_size
    processor.messages = {}
    processor.message_count = 0
    processor.last_time = nil
    return processor
end

function MessageProcessor:get_message_type(message)
    local path = message:match("([^\n]*)\n")
    if not path then return nil end
    
    if path:match("VIEWER_STATE.*") then
        return "viewer_state"
    elseif path:match("ASSET_FILE_UPDATE:(.+)") then
        return "asset_update:" .. path:match("ASSET_FILE_UPDATE:(.+)")
    elseif path:match("FILE_UPDATE:(.+)") then
        return "file_update:" .. path:match("FILE_UPDATE:(.+)")
    end
    return nil
end

function MessageProcessor:add_message(message)
    local msg_type = self:get_message_type(message)
    if not msg_type then 
        return message -- return unprocessed message if we can't categorize it
    end
    
    self.messages[msg_type] = message
    self.message_count = self.message_count + 1
    return nil -- return nil to indicate message was processed
end

function MessageProcessor:get_batch()
    local batch = {}
    for _, message in pairs(self.messages) do
        table.insert(batch, message)
    end
    
    self.messages = {}
    self.message_count = 0
    self.last_time = socket.gettime()
    
    return batch
end

return MessageProcessor