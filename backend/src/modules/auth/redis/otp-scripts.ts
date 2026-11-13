// Khóa định danh chung giữ giới hạn gửi lại/lần thử/theo giờ qua các challenge thay thế.
export const requestOtpScript = `
if redis.call('EXISTS', KEYS[1]..':lock') == 1 then return -1 end
if redis.call('EXISTS', KEYS[1]..':cooldown') == 1 then return -2 end
local sends = tonumber(redis.call('GET', KEYS[1]..':sends') or '0')
if sends >= 5 then redis.call('SET', KEYS[1]..':lock', '1', 'EX', 900); return -1 end
local previous = redis.call('GET', KEYS[1]..':current')
if previous then redis.call('DEL', previous) end
redis.call('INCR', KEYS[1]..':sends')
if sends == 0 then redis.call('EXPIRE', KEYS[1]..':sends', 3600) end
redis.call('SET', KEYS[1]..':cooldown', '1', 'EX', 60)
redis.call('SET', KEYS[1]..':current', KEYS[2], 'EX', 300)
redis.call('SET', KEYS[2], ARGV[1], 'EX', 300)
return 1`;

export const verifyOtpScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local challenge = cjson.decode(raw)
if challenge.binding ~= ARGV[1] then return 0 end
local identity = challenge.identity
if redis.call('EXISTS', identity..':lock') == 1 then return -1 end
if redis.call('GET', identity..':current') ~= KEYS[1] then return 0 end
local tries = tonumber(redis.call('GET', identity..':tries') or '0')
if tries >= 5 then redis.call('SET', identity..':lock', '1', 'EX', 900); redis.call('EXPIRE', identity..':tries', 900); return -1 end
if challenge.hash ~= ARGV[2] then
 redis.call('INCR', identity..':tries'); redis.call('EXPIRE', identity..':tries', 3600)
 if tries + 1 >= 5 then redis.call('SET', identity..':lock', '1', 'EX', 900); redis.call('EXPIRE', identity..':tries', 900); redis.call('DEL', KEYS[1]) end
 return 0
end
redis.call('DEL', KEYS[1], identity..':current', identity..':tries')
return 1`;
