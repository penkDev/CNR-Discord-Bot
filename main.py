import discord
from discord.ext import commands, tasks
import sqlite3
import aiohttp
import asyncio
import traceback
import yaml
from discord import app_commands
import sys
import os
from datetime import datetime, timedelta, timezone 
import urllib3
import signal

# Configuration 
def load_config(path):
    with open(path, 'r') as file:
        return yaml.safe_load(file)

config_path = os.path.join(os.path.dirname(__file__), 'config.yml')
config = load_config(config_path)

server_status_endpoint = config.get('server_status_endpoint')
if not server_status_endpoint:
    sys.exit(1)

BOTTOKEN = config['bottoken']
DATABASE = config['database']['name']
ENDPOINTS = config['endpoints']

GUILD_ID = int(config.get('guild_id'))  
STAFF_ROLE_ID = int(config.get('staff_role_id'))
CREWMEMBER_ROLE_ID = int(config.get('crewmember_role_id'))

EMBED_IMAGES = config.get('embed_images', {})
LINKUUID_THUMBNAIL = EMBED_IMAGES.get('linkuuid_thumbnail', "https://i.pinimg.com/originals/9a/3c/3f/9a3c3fb5f73822af8514df07f6676392.gif")
LINKING_ERROR_THUMBNAIL = EMBED_IMAGES.get('linking_error_thumbnail', "https://i.pinimg.com/originals/9a/3c/3f/9a3c3fb5f73822af8514df07f6676392.gif")
MYUUID_THUMBNAIL = EMBED_IMAGES.get('myuuid_thumbnail', "https://i.pinimg.com/originals/9a/3c/3f/9a3c3fb5f73822af8514df07f6676392.gif")
FOOTER_THUMBNAIL = EMBED_IMAGES.get('footer_thumbnail', "https://i.pinimg.com/originals/9a/3c/3f/9a3c3fb5f73822af8514df07f6676392.gif")
LOGS_THUMBNAIL = EMBED_IMAGES.get('logs_thumbnail', "https://i.pinimg.com/originals/9a/3c/3f/9a3c3fb5f73822af8514df07f6676392.gif")
ONLINE_USERS_CHANNEL_ID = config.get('online_users_channel_id') 
LEADERBOARD_CHANNEL_ID = config.get('leaderboard_channel_id')
LOG_CHANNEL_ID = config.get('staff_logs_channel_id')

# Database Setup 
def setup_database(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS players (
            uid TEXT PRIMARY KEY,
            username TEXT,
            playtime INTEGER DEFAULT 0,
            last_seen TEXT,
            server TEXT,
            is_online INTEGER DEFAULT 0
        )
    ''')
    conn.commit()

    c.execute('''
        CREATE TABLE IF NOT EXISTS discord_users (
            discord_id TEXT PRIMARY KEY,
            uuid TEXT UNIQUE
        )
    ''')
    conn.commit()

    c.execute('''
        CREATE TABLE IF NOT EXISTS bot_metadata (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    conn.commit()

    try:
        c.execute('''
            CREATE TABLE IF NOT EXISTS online_users_embed (
                server TEXT PRIMARY KEY,
                message_id INTEGER
            )
        ''')
    except sqlite3.OperationalError:
        pass
    conn.commit()

    try:
        c.execute('''
            CREATE TABLE IF NOT EXISTS leaderboard_embed (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                message_id INTEGER
            )
        ''')
    except sqlite3.OperationalError:
        pass
    conn.commit()

    return conn, c

# Bot Initialization
intents = discord.Intents.all()
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents)

conn, c = setup_database(DATABASE)
bot.conn = conn

bot.config = config
bot.GUILD_ID = GUILD_ID
bot.LOGS_THUMBNAIL = LOGS_THUMBNAIL
bot.LOG_CHANNEL_ID = LOG_CHANNEL_ID

bot.MYUUID_THUMBNAIL = MYUUID_THUMBNAIL

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Event Handlers
@bot.event
async def on_ready():
    try:
        await load_cogs()
        periodic_fetch.start()
        leaderboard_task.start()
        print(f'Logged in as {bot.user}')
    except Exception as e:
        traceback.print_exc()

# Tasks for fetching and displaying data
@tasks.loop(minutes=1)
async def periodic_fetch():
    try:
        c.execute('SELECT value FROM bot_metadata WHERE key = ?', ('last_run',))
        result = c.fetchone()
        if result:
            last_run_str = result[0]
            last_run = datetime.fromisoformat(last_run_str)
            if last_run.tzinfo is None:
                last_run = last_run.replace(tzinfo=timezone.utc)
        else:
            last_run = datetime.now(timezone.utc)
            c.execute('INSERT INTO bot_metadata (key, value) VALUES (?, ?)', ('last_run', last_run.isoformat()))
            conn.commit()
        
        current_time = datetime.now(timezone.utc)
        elapsed_time = (current_time - last_run).total_seconds()
        
        await fetch_and_store_data(elapsed_time)
        
        await asyncio.sleep(5)
        await display_online_users()
        
        c.execute('UPDATE bot_metadata SET value = ? WHERE key = ?', (current_time.isoformat(), 'last_run'))
        conn.commit()
    except Exception as e:
        traceback.print_exc()

@tasks.loop(minutes=2)
async def leaderboard_task():
    await update_leaderboard()

# Functions for fetching and storing data/embeds ect
async def fetch_and_store_data(elapsed_seconds):
    current_time = datetime.now(timezone.utc)
    try:
        fetched_uids = set()
        
        async with aiohttp.ClientSession() as session:
            for server, url in ENDPOINTS.items():
                try:
                    async with session.get(url) as response:
                        try:
                            response.raise_for_status()
                        except aiohttp.ClientResponseError as e:
                            print(f"Request failed: {e}")
                            print(f"Response: {await response.text()}")
                            await asyncio.sleep(5)
                            continue
                        try:
                            data = await response.json(content_type=None)
                        except aiohttp.ContentTypeError:
                            print(f"Unexpected content type: {response.content_type} from {url}")
                            print(f"Response: {await response.text()}")
                            await asyncio.sleep(5)
                            continue
                        for player in data:
                            uid = player.get('Uid')
                            username = player.get('Username', {}).get('Username')
                            if uid and username:
                                fetched_uids.add(uid)
                                c.execute('SELECT playtime, last_seen FROM players WHERE uid = ?', (uid,))
                                result = c.fetchone()
                                if result:
                                    playtime, last_seen_str = result
                                    playtime += int(elapsed_seconds)
                                    c.execute('''
                                        UPDATE players
                                        SET username = ?, last_seen = ?, is_online = 1, server = ?, playtime = ?
                                        WHERE uid = ?
                                    ''', (username, current_time.isoformat(), server, playtime, uid))
                                else:
                                    c.execute('''
                                        INSERT INTO players (uid, username, last_seen, server, is_online, playtime)
                                        VALUES (?, ?, ?, ?, 1, 0)
                                    ''', (uid, username, current_time.isoformat(), server))
                        await asyncio.sleep(5)
                except Exception as e:
                    traceback.print_exc()
                    await asyncio.sleep(5)

        if fetched_uids:
            placeholders = ','.join(['?'] * len(fetched_uids))
            c.execute(f'SELECT uid FROM players WHERE uid NOT IN ({placeholders}) AND is_online = 1', tuple(fetched_uids))
        else:
            c.execute('SELECT uid FROM players WHERE is_online = 1')
        offline_players = c.fetchall()
        for (uid,) in offline_players:
            c.execute('UPDATE players SET is_online = 0 WHERE uid = ?', (uid,))

        conn.commit()
    except Exception as e:
        traceback.print_exc()

async def display_online_users():
    try:
        channel = bot.get_channel(ONLINE_USERS_CHANNEL_ID)
        if not channel:
            return

        online_users = {}
        for server in ENDPOINTS.keys():
            c.execute('''
                SELECT p.username
                FROM players p
                JOIN discord_users d ON p.uid = d.uuid
                WHERE p.server = ? AND p.is_online = 1
            ''', (server,))
            users = [row[0] for row in c.fetchall()]
            online_users[server] = users

        await asyncio.sleep(5)

        server_key_map = {
            'eu1': 'EU1',
            'eu2': 'EU2',
            'us1': 'US1',
            'us2': 'US2',
            'sea1': 'SEA'
        }

        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            try:
                async with session.get(server_status_endpoint) as response:
                    try:
                        response.raise_for_status()
                    except aiohttp.ClientResponseError as e:
                        print(f"Request failed: {e}")
                        print(f"Response: {await response.text()}")
                        server_status = {}
                        await asyncio.sleep(5)
                    else:
                        try:
                            server_status_data = await response.json(content_type=None)
                            server_status = {entry['Id'].lower(): entry for entry in server_status_data}
                        except aiohttp.ContentTypeError:
                            print(f"Unexpected content type: {response.content_type} from {server_status_endpoint}")
                            print(f"Response: {await response.text()}")
                            server_status = {}
                            await asyncio.sleep(5)
            except Exception as e:
                traceback.print_exc()
                server_status = {}
                await asyncio.sleep(5)

            for server, users in online_users.items():
                embed = discord.Embed(
                    title=f"🌐 Online Players - {server.upper()}",
                    color=0x00BFFF,
                    timestamp=datetime.now(timezone.utc)
                )

                await asyncio.sleep(3)

                status_id = server_key_map.get(server, server).lower()
                status = server_status.get(status_id, {})

                players_online = status.get('Players', 'N/A')
                queued_players = status.get('QueuedPlayers', 'N/A')

                status_endpoint = config.get('status_endpoints', {}).get(f'server_name {server.upper()}')
                if status_endpoint:
                    try:
                        async with session.get(status_endpoint) as response:
                            try:
                                response.raise_for_status()
                            except aiohttp.ClientResponseError as e:
                                print(f"Request failed: {e}")
                                print(f"Response: {await response.text()}")
                                time_till_restart = 'N/A'
                                await asyncio.sleep(5)
                            else:
                                try:
                                    status_data = await response.json(content_type=None)
                                    time_string = status_data.get('vars', {}).get('Time')
                                    if time_string:
                                        seconds_remaining = convert_time(time_string)
                                        time_till_restart = seconds_remaining_to_human_readable(seconds_remaining)
                                    else:
                                        time_till_restart = 'N/A'
                                except aiohttp.ContentTypeError:
                                    print(f"Unexpected content type: {response.content_type} from {status_endpoint}")
                                    print(f"Response: {await response.text()}")
                                    time_till_restart = 'N/A'
                                    await asyncio.sleep(5) 
                    except Exception as e:
                        traceback.print_exc()
                        time_till_restart = 'N/A'
                        await asyncio.sleep(5)
                else:
                    time_till_restart = 'N/A'

                embed.add_field(name="Players Online", value=f"`{players_online}`", inline=True)
                embed.add_field(name="Queue Length", value=f"`{queued_players}`", inline=True)
                embed.add_field(name="Time till restart", value=f"`{time_till_restart}`", inline=True)

                if users:
                    user_list = '\n'.join(users)
                    embed.add_field(name="Online Users", value=user_list, inline=False)
                else:
                    embed.add_field(name="Online Users", value="No online players.", inline=False)

                embed.set_footer(text="CNR Crew Bot by penk", icon_url=FOOTER_THUMBNAIL)

                c.execute('SELECT message_id FROM online_users_embed WHERE server = ?', (server,))
                result = c.fetchone()
                if result:
                    message_id = result[0]
                    try:
                        message = await channel.fetch_message(message_id)
                        await message.edit(embed=embed)
                    except discord.NotFound:
                        new_message = await channel.send(embed=embed)
                        c.execute('UPDATE online_users_embed SET message_id = ? WHERE server = ?', (new_message.id, server))
                        conn.commit()
                else:
                    new_message = await channel.send(embed=embed)
                    c.execute('INSERT INTO online_users_embed (server, message_id) VALUES (?, ?)',
                              (server, new_message.id))
                    conn.commit()
    except Exception as e:
        traceback.print_exc()

async def update_leaderboard():
    try:
        channel = bot.get_channel(LEADERBOARD_CHANNEL_ID)
        if not channel:
            return

        c.execute('''
            SELECT p.username, p.playtime
            FROM players p
            JOIN discord_users d ON p.uid = d.uuid
            ORDER BY p.playtime DESC
            LIMIT 10
        ''')
        top_players = c.fetchall()

        embed = discord.Embed(
            title="🏆 Top 10 Players by Playtime",
            color=0xFFD700,
            timestamp=datetime.now(timezone.utc)
        )

        await asyncio.sleep(3)

        if top_players:
            leaderboard = ""
            for rank, (username, playtime) in enumerate(top_players, start=1):
                playtime_formatted = convert_seconds_to_hms(playtime)
                leaderboard += f"**{rank}. {username}** - {playtime_formatted}\n"
            embed.add_field(name="Leaderboard", value=leaderboard, inline=False)
        else:
            embed.add_field(name="Leaderboard", value="No players to display.", inline=False)

        embed.set_footer(text="CNR Crew Bot by penk", icon_url=FOOTER_THUMBNAIL)

        c.execute('SELECT message_id FROM leaderboard_embed WHERE id = 1')
        result = c.fetchone()
        if result:
            message_id = result[0]
            try:
                message = await channel.fetch_message(message_id)
                await message.edit(embed=embed)
            except discord.NotFound:
                new_message = await channel.send(embed=embed)
                c.execute('UPDATE leaderboard_embed SET message_id = ? WHERE id = 1', (new_message.id,))
                conn.commit()
        else:
            new_message = await channel.send(embed=embed)
            c.execute('INSERT INTO leaderboard_embed (id, message_id) VALUES (1, ?)', (new_message.id,))
            conn.commit()
    except Exception as e:
        traceback.print_exc()

def convert_time(input_str):
    weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    try:
        day_str, time_str = input_str.split()
        current_day_index = weekdays.index(day_str)
        current_hour, current_minute = map(int, time_str.split(':'))

        total_week_minutes = 7 * 24 * 60

        current_time_minutes = current_day_index * 24 * 60 + current_hour * 60 + current_minute

        target_day_index = weekdays.index('Saturday')
        target_time_minutes = target_day_index * 24 * 60 + 23 * 60 + 59

        remaining_minutes = target_time_minutes - current_time_minutes
        if remaining_minutes < 0:
            remaining_minutes += total_week_minutes

        real_seconds_remaining = remaining_minutes
        return real_seconds_remaining
    except Exception as e:
        traceback.print_exc()
        return 0

def seconds_remaining_to_human_readable(real_seconds):
    minutes = real_seconds // 60
    hours = minutes // 60
    minutes = minutes % 60
    return f"{int(hours)}h, {int(minutes)}m"

def mark_all_players_offline():
    """Marks all players as offline in the database."""
    try:
        c.execute('UPDATE players SET is_online = 0 WHERE is_online = 1')
        conn.commit()
    except Exception as e:
        traceback.print_exc()

async def shutdown():
    """Performs cleanup tasks before shutting down the bot."""
    mark_all_players_offline()
    await bot.close()
    conn.close()

async def load_cogs():
    for filename in os.listdir('./commands'):
        if filename.endswith('.py') and filename != '__init__.py':
            await bot.load_extension(f'commands.{filename[:-3]}')

async def is_crewmember(interaction: discord.Interaction) -> bool:
    """Check if the user has the CrewMember role."""
    if any(role.id == CREWMEMBER_ROLE_ID for role in interaction.user.roles):
        return True
    raise app_commands.CheckFailure("You do not have the required role to use this command.")

def convert_seconds_to_hms(seconds):
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{int(hours)}h {int(minutes)}m {int(secs)}s"

# Shutdown Handlers

def handle_exit(signum, frame):
    """Handles exit signals by scheduling the shutdown coroutine."""
    asyncio.create_task(shutdown())

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

bot.run(BOTTOKEN)
