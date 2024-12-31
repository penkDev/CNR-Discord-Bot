import discord
from discord.ext import commands, tasks
import sqlite3
import requests
import asyncio
import traceback
import yaml
from discord import app_commands
import sys
import os
from datetime import datetime, timedelta, timezone 
import urllib3
import signal 

config_path = os.path.join(os.path.dirname(__file__), 'config.yml')
with open(config_path, 'r') as file:
    config = yaml.safe_load(file)

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

intents = discord.Intents.all()
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents)

conn = sqlite3.connect(DATABASE)
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

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

async def fetch_and_store_data(elapsed_seconds):
    current_time = datetime.now(timezone.utc)
    try:
        fetched_uids = set()
        
        for server, url in ENDPOINTS.items():
            try:
                response = requests.get(url)
                response.raise_for_status()
                data = response.json()
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

        try:
            response = requests.get(server_status_endpoint)
            response.raise_for_status()
            server_status_data = response.json()
            server_status = {entry['Id'].lower(): entry for entry in server_status_data}
        except Exception as e:
            traceback.print_exc()
            server_status = {}

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
                    response = requests.get(status_endpoint, verify=False)
                    response.raise_for_status()
                    status_data = response.json()
                    time_string = status_data.get('vars', {}).get('Time')
                    if time_string:
                        seconds_remaining = convert_time(time_string)
                        time_till_restart = seconds_remaining_to_human_readable(seconds_remaining)
                    else:
                        time_till_restart = 'N/A'
                except Exception as e:
                    traceback.print_exc()
                    time_till_restart = 'N/A'
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

@tasks.loop(minutes=2)
async def leaderboard_task():
    await update_leaderboard()

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

def handle_exit(signum, frame):
    """Handles exit signals by scheduling the shutdown coroutine."""
    asyncio.create_task(shutdown())

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

@bot.event
async def on_ready():
    try:
        periodic_fetch.start()
        await bot.tree.sync()
        leaderboard_task.start()
    except Exception as e:
        traceback.print_exc()

@bot.tree.command(name='playtime', description='Displays the total playtime of a user.')
@app_commands.describe(member='The member to get playtime for.')
async def playtime(interaction: discord.Interaction, member: discord.Member):
    try:
        await interaction.response.defer()
        c.execute('SELECT uuid FROM discord_users WHERE discord_id = ?', (str(member.id),))
        link = c.fetchone()
        
        if not link:
            await interaction.followup.send(f"{member.display_name} has not linked their UUID. Use `/linkuuid` to link.")
            return
        
        uuid = link[0]
        
        c.execute('SELECT playtime FROM players WHERE uid = ?', (uuid,))
        result = c.fetchone()
    
        if result:
            playtime_seconds = result[0]
            playtime_formatted = convert_seconds_to_hms(playtime_seconds)
            embed = discord.Embed(
                title=f"📊 {member.display_name}'s Playtime",
                color=0x00FF00,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
            embed.add_field(name='Total Playtime', value=playtime_formatted, inline=False)
            embed.set_footer(
                text="CNR Crew Bot by penk", 
                icon_url=EMBED_IMAGES.get('footer_thumbnail')
            )
            await interaction.followup.send(embed=embed)
        else:
            embed = discord.Embed(
                title="❓ No recorded playtime",
                description=f"{member.display_name} has no recorded playtime.",
                color=0xFFA500,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_footer(
                text="CNR Crew Bot by penk", 
                icon_url=EMBED_IMAGES.get('footer_thumbnail') 
            )
            await interaction.followup.send(embed=embed)
    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send("An error occurred while retrieving playtime.")

@playtime.error
async def playtime_error(interaction: discord.Interaction, error):
    if isinstance(error, discord.app_commands.errors.MissingPermissions):
        await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
    else:
        await interaction.response.send_message("An error occurred while processing the playtime command.", ephemeral=True)

@bot.tree.command(name='myuuid', description='Displays the UUID linked to a specified username.')
@app_commands.describe(username='The username to retrieve the UUID for.')
async def myuuid(interaction: discord.Interaction, username: str):
    try:
        await interaction.response.defer()
        c.execute('SELECT uid, server FROM players WHERE username = ?', (username,))
        result = c.fetchone()
        
        if result:
            uuid, server = result
            embed = discord.Embed(
                title=f"🔗 UUID for `{username}`",
                description=f"**UUID:** `{uuid}`",
                color=0x1ABC9C,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.avatar.url if interaction.user.avatar else None)
            embed.add_field(name="📍 Server", value=server.capitalize(), inline=True)
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=interaction.guild.icon.url if interaction.guild.icon else None)
            embed.set_thumbnail(url=MYUUID_THUMBNAIL)
            await interaction.followup.send(embed=embed)
        else:
            embed = discord.Embed(
                title="❌ UUID Not Found",
                description=f"No UUID found for username `{username}`.",
                color=0xE74C3C,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=interaction.guild.icon.url if interaction.guild.icon else None)
            await interaction.followup.send(embed=embed)
    except Exception as e:
        traceback.print_exc()
        embed = discord.Embed(
            title="⚠️ Error",
            description="An error occurred while retrieving the UUID. Please try again later.",
            color=0xE74C3C,
            timestamp=datetime.now(timezone.utc)
        )
        embed.set_footer(text="CNR Crew Bot by penk", icon_url=interaction.guild.icon.url if interaction.guild.icon else None)
        await interaction.followup.send(embed=embed)

@myuuid.error
async def myuuid_error(interaction: discord.Interaction, error):
    if isinstance(error, discord.app_commands.errors.CommandInvokeError):
        await interaction.response.send_message("Failed to retrieve UUID. Please ensure the username is correct.", ephemeral=True)
    else:
        await interaction.response.send_message("An unexpected error occurred.", ephemeral=True)

async def is_crewmember(interaction: discord.Interaction) -> bool:
    """Check if the user has the CrewMember role."""
    if any(role.id == CREWMEMBER_ROLE_ID for role in interaction.user.roles):
        return True
    raise app_commands.CheckFailure("You do not have the required role to use this command.")

@bot.tree.command(name='linkuuid', description='Link your Discord account to your game UUID.')
@app_commands.describe(uuid='Your game UUID to link with your Discord account.')
@app_commands.check(is_crewmember)
async def linkuuid(interaction: discord.Interaction, uuid: str):
    try:
        discord_id = str(interaction.user.id)
        
        c.execute('SELECT uid FROM players WHERE uid = ?', (uuid,))
        player = c.fetchone()
        if not player:
            await interaction.response.send_message("The provided UUID does not exist in our records.", ephemeral=True)
            return
        
        c.execute('SELECT discord_id FROM discord_users WHERE uuid = ?', (uuid,))
        existing = c.fetchone()
        if existing:
            await interaction.response.send_message("This UUID is already linked to another Discord account.", ephemeral=True)
            return
        
        c.execute('''
            INSERT INTO discord_users (discord_id, uuid)
            VALUES (?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET uuid=excluded.uuid
        ''', (discord_id, uuid))
        conn.commit()
        
        embed = discord.Embed(
            title="✅ Successfully Linked",
            description="Your Discord account has been successfully linked to your UUID.",
            color=0x00FF00,
            timestamp=datetime.now(timezone.utc)
        )
        embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
        embed.add_field(name='Linked UUID', value=uuid, inline=False)
        embed.set_footer(text="CNR Crew Bot by penk", icon_url=LINKUUID_THUMBNAIL)
        await interaction.response.send_message(embed=embed, ephemeral=True)
    except app_commands.CheckFailure as e:
        await interaction.response.send_message(str(e), ephemeral=True)
    except Exception as e:
        embed = discord.Embed(
            title="❌ Linking Error",
            description="An error occurred while linking your UUID. Please try again.",
            color=0xFF0000,
            timestamp=datetime.now(timezone.utc)
        )
        embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
        embed.set_footer(text="CNR Crew Bot by penk", icon_url=LINKING_ERROR_THUMBNAIL)
        await interaction.response.send_message(embed=embed, ephemeral=True)

@linkuuid.error
async def linkuuid_error(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.CheckFailure):
        await interaction.response.send_message(str(error), ephemeral=True)
    else:
        await interaction.response.send_message("An error occurred while linking your UUID.", ephemeral=True)

def convert_seconds_to_hms(seconds):
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{int(hours)}h {int(minutes)}m {int(secs)}s"

@bot.command(name='sync')
@commands.has_role(int(STAFF_ROLE_ID))
async def sync(ctx):
    try:
        if not GUILD_ID:
            await ctx.send("Guild ID is not configured.")
            return

        bot.tree.copy_global_to(guild=discord.Object(id=GUILD_ID))
        await bot.tree.sync(guild=discord.Object(id=GUILD_ID))
        await ctx.send("Synchronised successfully.")
    except Exception as e:
        await ctx.send(f"Synchronisation failed: {e}")

@sync.error
async def sync_error(ctx: commands.Context, error):
    if isinstance(error, commands.MissingRole):
        await ctx.send("You don't have the required role to use this command.")
    else:
        await ctx.send("An error occurred while synchronizing commands.")

@bot.tree.command(name='resetleaderboard', description='Reset all players\' playtime to 0 (Staff only).')
@app_commands.default_permissions(administrator=True)
async def reset_leaderboard(interaction: discord.Interaction):
    """Reset all players' playtime to 0. Staff only."""
    try:
        c.execute('UPDATE players SET playtime = 0')
        conn.commit()
        await interaction.response.send_message("✅ All player playtimes have been reset to 0.", ephemeral=True)
    except Exception as e:
        traceback.print_exc()
        await interaction.response.send_message("❌ An error occurred while resetting playtimes.", ephemeral=True)

@reset_leaderboard.error
async def reset_leaderboard_error(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.CheckFailure):
        await interaction.response.send_message(str(error), ephemeral=True)
    else:
        await interaction.response.send_message("An error occurred while resetting the leaderboard.", ephemeral=True)

@bot.tree.command(name="mute", description="Mute a player.", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(moderate_members=True)
@app_commands.describe(
    member="The member to mute",
    reason="Reason for muting",
    duration="Duration of the mute"
)
@app_commands.choices(duration=[
    app_commands.Choice(name="1 minute", value="1 minute"),
    app_commands.Choice(name="5 minutes", value="5 minutes"),
    app_commands.Choice(name="10 minutes", value="10 minutes"),
    app_commands.Choice(name="30 minutes", value="30 minutes"),
    app_commands.Choice(name="1 hour", value="1 hour"),
    app_commands.Choice(name="4 hours", value="4 hours"),
    app_commands.Choice(name="10 hours", value="10 hours"),
    app_commands.Choice(name="1 day", value="1 day"),
    app_commands.Choice(name="1 week", value="1 week")
])
async def mute(
    interaction: discord.Interaction, 
    member: discord.Member, 
    reason: str, 
    duration: app_commands.Choice[str]
):
    time_dict = {
        "1 minute": 1,
        "5 minutes": 5,
        "10 minutes": 10,
        "30 minutes": 30,
        "1 hour": 60,
        "4 hours": 240,
        "10 hours": 600,
        "1 day": 1440,
        "1 week": 10080
    }

    duration_minutes = time_dict.get(duration.value)
    if duration_minutes:
        until = discord.utils.utcnow() + timedelta(minutes=duration_minutes)
        await member.timeout(until, reason=reason)
        embed = discord.Embed(
            title="🔇 User Muted",
            description=(
                f"**Muted User:** {member.mention} ({member})\n"
                f"**Reason:** {reason}\n"
                f"**Muted By:** {interaction.user.mention} ({interaction.user})\n"
                f"**Duration:** {duration.name}"
            ),
            color=discord.Color.blue(),
            timestamp=interaction.created_at
        )
        embed.set_footer(text="CNR Crew Bot by penk", icon_url=LOGS_THUMBNAIL)
        log_channel = bot.get_channel(LOG_CHANNEL_ID)
        await log_channel.send(embed=embed)
        await interaction.response.send_message(embed=embed, ephemeral=True)
    else:
        await interaction.response.send_message("Invalid mute duration.", ephemeral=True)

@mute.error
async def mute_error(interaction: discord.Interaction, error):
    if isinstance(error, discord.app_commands.errors.MissingPermissions):
        await interaction.response.send_message("You don't have permission to mute members.", ephemeral=True)
    else:
        await interaction.response.send_message("An error occurred while muting the user.", ephemeral=True)

@bot.tree.command(name="kick", description="Kick a player.", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(kick_members=True)
@app_commands.describe(
    member="The member to kick",
    reason="Reason for kicking"
)
async def kick(
    interaction: discord.Interaction,
    member: discord.Member,
    reason: str
):
    await interaction.guild.kick(member, reason=reason)
    embed = discord.Embed(
        title="🚪 User Kicked",
        description=(
            f"**Kicked User:** {member.mention} ({member})\n"
            f"**Reason:** {reason}\n"
            f"**Kicked By:** {interaction.user.mention} ({interaction.user})"
        ),
        color=discord.Color.orange(),
        timestamp=interaction.created_at
    )
    embed.set_footer(text="CNR Crew Bot by penk", icon_url=LOGS_THUMBNAIL)
    log_channel = bot.get_channel(LOG_CHANNEL_ID)
    if log_channel:
        await log_channel.send(embed=embed)
    await interaction.response.send_message(embed=embed, ephemeral=True)

@kick.error
async def kick_error(interaction: discord.Interaction, error):
    if isinstance(error, discord.app_commands.errors.MissingPermissions):
        await interaction.response.send_message("You don't have permission to kick members.", ephemeral=True)
    else:
        await interaction.response.send_message("An error occurred while kicking the user.", ephemeral=True)

@bot.tree.command(name="ban", description="Ban a player.", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(ban_members=True)
@app_commands.describe(
    member="The member to ban",
    reason="Reason for banning"
)
async def ban(
    interaction: discord.Interaction,
    member: discord.Member,
    reason: str
):
    await interaction.guild.ban(member, reason=reason)
    embed = discord.Embed(
        title="🚫 User Banned",
        description=(
            f"**Banned User:** {member.mention} ({member})\n"
            f"**Reason:** {reason}\n"
            f"**Banned By:** {interaction.user.mention} ({interaction.user})"
        ),
        color=discord.Color.red(),
        timestamp=interaction.created_at
    )
    embed.set_footer(text="CNR Crew Bot by penk", icon_url=LOGS_THUMBNAIL)
    log_channel = bot.get_channel(LOG_CHANNEL_ID)
    if log_channel:
        await log_channel.send(embed=embed)
    await interaction.response.send_message(embed=embed, ephemeral=True)

@ban.error
async def ban_error(interaction: discord.Interaction, error):
    if isinstance(error, discord.app_commands.errors.MissingPermissions):
        await interaction.response.send_message("You don't have permission to ban members.", ephemeral=True)
    else:
        await interaction.response.send_message("An error occurred while banning the user.", ephemeral=True)

bot.run(BOTTOKEN)
