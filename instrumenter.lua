local function create_instrumenter()
    -- Constants for parsing states
    local State = {
        CODE = 1,
        STRING_SINGLE = 2,
        STRING_DOUBLE = 3,
        LONG_STRING = 4,
        COMMENT_SHORT = 5,
        COMMENT_LONG = 6
    }

    -- Utilities
    local function is_whitespace(c)
        return c == ' ' or c == '\t' or c == '\n' or c == '\r'
    end

    local function count_equals(str, start)
        local count = 0
        while str:sub(start + count, start + count) == '=' do
            count = count + 1
        end
        return count
    end

    local function find_long_string_end(str, start, eq_count)
        local pattern = ']' .. string.rep('=', eq_count) .. ']'
        local pos = start
        while true do
            pos = str:find(pattern, pos, true)
            if not pos then return nil end
            return pos + #pattern
        end
    end

    local function is_identifier_char(c)
        return c:match('[%w_]')
    end

    local function skip_whitespace(str, pos)
        while pos <= #str do
            local c = str:sub(pos, pos)
            if not is_whitespace(c) then break end
            pos = pos + 1
        end
        return pos
    end

    -- Parse identifiers (single or multiple)
    local function get_identifiers(str, start)
        local pos = start
        local len = #str
        local identifiers = {}
        
        pos = skip_whitespace(str, pos)
        if pos > len then return nil end
        
        -- Handle local keyword
        if str:sub(pos, pos + 4) == 'local' then
            pos = skip_whitespace(str, pos + 5)
        end


        -- Check if line starts with 'for'
        if str:sub(pos, pos + 2) == 'for' then return nil end
        
        while true do
            -- Parse single identifier
            if not str:sub(pos, pos):match('[%a_]') then return nil end
            local id = str:sub(pos, pos)
            pos = pos + 1
            
            -- Rest of identifier
            while pos <= len do
                local c = str:sub(pos, pos)
                if is_identifier_char(c) then
                    id = id .. c
                    pos = pos + 1
                elseif c == '.' then
                    if pos + 1 <= len and is_identifier_char(str:sub(pos + 1, pos + 1)) then
                        id = id .. c
                        pos = pos + 1
                    else
                        break
                    end
                elseif c == '[' then
                    local bracket_count = 1
                    local index_part = c
                    pos = pos + 1
                    while pos <= len and bracket_count > 0 do
                        c = str:sub(pos, pos)
                        index_part = index_part .. c
                        if c == '[' then
                            bracket_count = bracket_count + 1
                        elseif c == ']' then
                            bracket_count = bracket_count - 1
                        end
                        pos = pos + 1
                    end
                    if bracket_count == 0 then
                        id = id .. index_part
                    else
                        break
                    end
                else
                    break
                end
            end
            
            if not id:match('_.*') then
                table.insert(identifiers, id)
            end
            
            -- Skip whitespace after identifier
            pos = skip_whitespace(str, pos)
            if pos > len then return nil end
            
            -- Check for comma or equals
            local c = str:sub(pos, pos)
            if c == '=' then
                return identifiers, pos + 1
            elseif c == ',' then
                pos = skip_whitespace(str, pos + 1)
            else
                return nil
            end
        end
    end

    -- Main parsing function
    local function parse_code(code)
        local result = {}
        local current_state = State.CODE
        local pos = 1
        local line_start = 1
        local current_line = 1
        local len = #code
        local assignments = {}
        local current_assignment = nil
        local brace_depth = 0
        local paren_depth = 0
        local bracket_depth = 0
        local long_string_equals = 0
        local line_starts = {1}

        local function add_assignment()
            if current_assignment then
                current_assignment.end_line = current_line
                table.insert(assignments, current_assignment)
                current_assignment = nil
            end
        end

        while pos <= len do
            local c = code:sub(pos, pos)
            
            if current_state == State.CODE then
                if c == '-' and code:sub(pos + 1, pos + 1) == '-' then
                    if code:sub(pos + 2, pos + 2) == '[' then
                        local eq_count = count_equals(code, pos + 3)
                        if code:sub(pos + 3 + eq_count, pos + 3 + eq_count) == '[' then
                            current_state = State.COMMENT_LONG
                            long_string_equals = eq_count
                            pos = pos + 3 + eq_count + 1
                        else
                            current_state = State.COMMENT_SHORT
                            pos = pos + 2
                        end
                    else
                        current_state = State.COMMENT_SHORT
                        pos = pos + 2
                    end
                elseif c == '"' then
                    current_state = State.STRING_DOUBLE
                    pos = pos + 1
                elseif c == "'" then
                    current_state = State.STRING_SINGLE
                    pos = pos + 1
                elseif c == '[' then
                    local next_char = code:sub(pos + 1, pos + 1)
                    if next_char == '[' or next_char == '=' then
                        local eq_count = count_equals(code, pos + 1)
                        if code:sub(pos + 1 + eq_count, pos + 1 + eq_count) == '[' then
                            current_state = State.LONG_STRING
                            long_string_equals = eq_count
                            pos = pos + 2 + eq_count
                        else
                            bracket_depth = bracket_depth + 1
                            pos = pos + 1
                        end
                    else
                        bracket_depth = bracket_depth + 1
                        pos = pos + 1
                    end
                elseif c == '{' then
                    brace_depth = brace_depth + 1
                    pos = pos + 1
                elseif c == '(' then
                    paren_depth = paren_depth + 1
                    pos = pos + 1
                elseif c == '}' then
                    brace_depth = brace_depth - 1
                    if brace_depth == 0 and paren_depth == 0 and bracket_depth == 0 then
                        add_assignment()
                    end
                    pos = pos + 1
                elseif c == ')' then
                    paren_depth = paren_depth - 1
                    if brace_depth == 0 and paren_depth == 0 and bracket_depth == 0 then
                        add_assignment()
                    end
                    pos = pos + 1
                elseif c == ']' then
                    bracket_depth = bracket_depth - 1
                    if brace_depth == 0 and paren_depth == 0 and bracket_depth == 0 then
                        add_assignment()
                    end
                    pos = pos + 1
                elseif c == '\n' then
                    current_line = current_line + 1
                    line_start = pos + 1
                    table.insert(line_starts, pos + 1)
                    pos = pos + 1
                else
                    -- Check for assignment if we're not currently tracking one
                    if not current_assignment then
                        local identifiers, new_pos = get_identifiers(code, pos)
                        if identifiers then
                            current_assignment = {
                                vars = identifiers,
                                start_line = current_line,
                                end_line = current_line,
                            }
                            pos = new_pos
                        else
                            pos = pos + 1
                        end
                    else
                        pos = pos + 1
                    end
                end
            elseif current_state == State.STRING_SINGLE then
                if c == "'" and code:sub(pos - 1, pos - 1) ~= '\\' then
                    current_state = State.CODE
                elseif c == '\n' then
                    current_line = current_line + 1
                    line_start = pos + 1
                    table.insert(line_starts, pos + 1)
                end
                pos = pos + 1
            elseif current_state == State.STRING_DOUBLE then
                if c == '"' and code:sub(pos - 1, pos - 1) ~= '\\' then
                    current_state = State.CODE
                elseif c == '\n' then
                    current_line = current_line + 1
                    line_start = pos + 1
                    table.insert(line_starts, pos + 1)
                end
                pos = pos + 1
            elseif current_state == State.LONG_STRING then
                if c == ']' then
                    local end_pos = find_long_string_end(code, pos, long_string_equals)
                    if end_pos then
                        pos = end_pos
                        current_state = State.CODE
                        goto continue
                    end
                end
                if c == '\n' then
                    current_line = current_line + 1
                    line_start = pos + 1
                    table.insert(line_starts, pos + 1)
                end
                pos = pos + 1
            elseif current_state == State.COMMENT_SHORT then
                if c == '\n' then
                    current_state = State.CODE
                    current_line = current_line + 1
                    line_start = pos + 1
                    table.insert(line_starts, pos + 1)
                end
                pos = pos + 1
            elseif current_state == State.COMMENT_LONG then
                if c == ']' then
                    local end_pos = find_long_string_end(code, pos, long_string_equals)
                    if end_pos then
                        pos = end_pos
                        current_state = State.CODE
                        goto continue
                    end
                end
                if c == '\n' then
                    current_line = current_line + 1
                    line_start = pos + 1
                    table.insert(line_starts, pos + 1)
                end
                pos = pos + 1
            end
            ::continue::
        end

        add_assignment()
        return assignments, line_starts
    end

    -- Generate a table constructor string for multiple values
    local function generate_values_table(vars)
        local parts = {}
        for _, var in ipairs(vars) do
            -- For variables with dots or brackets, we need to escape them as strings
            -- e.g., self.current becomes ["self.current"] = self.current
            if var:match("[%.%[%]]") then
                table.insert(parts, string.format("[%q] = %s", var, var))
            else
                table.insert(parts, string.format("%s = %s", var, var))
            end
        end
        return "{" .. table.concat(parts, ", ") .. "}"
    end

    -- Instrument the code
    local function instrument_code(path, code)

        local assignments, line_starts = parse_code(code)
        
        -- Split code into lines while preserving empty lines
        local lines = {}
        local pos = 1
        for i = 1, #line_starts do
            local next_start = line_starts[i + 1] or (#code + 1)
            local line = code:sub(line_starts[i], next_start - 1)
            if line:sub(-1) == '\n' then
                line = line:sub(1, -2)
            end
            table.insert(lines, line)
        end
        
        -- Insert instrumentation
        local result = {
            [[local _record_assign = function(l, vars) livelove.record_result("]]..path..[[", l, vars) end]]
        }
        
        -- Track which lines contain or are part of return statements
        local return_lines = {}
        for i, line in ipairs(lines) do
            if line:match('return') then
                return_lines[i] = true
                
                -- If this is a return with a table constructor, mark subsequent lines until balanced closing
                if line:match('return%s*{') then
                    local open_count = select(2, line:gsub('{', ''))
                    local close_count = select(2, line:gsub('}', ''))
                    local brace_depth = open_count - close_count
                    
                    if brace_depth > 0 then
                        local j = i + 1
                        while j <= #lines and brace_depth > 0 do
                            return_lines[j] = true
                            local line_open = select(2, lines[j]:gsub('{', ''))
                            local line_close = select(2, lines[j]:gsub('}', ''))
                            brace_depth = brace_depth + line_open - line_close
                            j = j + 1
                        end
                    end
                end
            end
        end

        for i, line in ipairs(lines) do
            table.insert(result, line)
            
            for _, assign in ipairs(assignments) do
                if assign.end_line == i then
                    if not line:match('^%s*{%s*$') and not return_lines[i] then
                        table.insert(result, string.format(
                            "_record_assign(%d, %s)",
                            assign.start_line,
                            generate_values_table(assign.vars)
                        ))
                    end
                end
            end
        end
        
        return table.concat(result, '\n')
    end

    return {
        instrument_code = instrument_code,
        _parse_code = parse_code
    }
end

return create_instrumenter()
