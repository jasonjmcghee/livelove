function hexToFloats(c)
    if c == nil then
        return 0, 0, 0, 0
    end
    local r = tonumber(c:sub(2, 3), 16) / 255
    local g = tonumber(c:sub(4, 5), 16) / 255
    local b = tonumber(c:sub(6, 7), 16) / 255
    local a = 1.0 -- default alpha
    
    if #c >= 9 then -- check if alpha channel exists
        a = tonumber(c:sub(8, 9), 16) / 255
    end
    
    return r, g, b, a
end