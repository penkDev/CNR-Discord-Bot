import discord
from discord.ext import commands
from discord import app_commands
from datetime import timedelta 
import traceback

class Moderation(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name='sync')
    async def sync_commands(self, ctx):
        if not ctx.author.guild_permissions.manage_guild:
            await ctx.send("❌ You don't have the required role to use this command.")
            return

        """Synchronise all slash commands to the specified guild."""
        try:
            if not self.bot.GUILD_ID:
                await ctx.send("Guild ID is not configured.")
                return

            self.bot.tree.copy_global_to(guild=discord.Object(id=self.bot.GUILD_ID))
            await self.bot.tree.sync(guild=discord.Object(id=self.bot.GUILD_ID))
            await ctx.send("🔄 Synchronized successfully.")
        except Exception as e:
            await ctx.send(f"❌ Synchronization failed: {e}")

    @commands.command(name='clearslash')
    async def clear_slash_commands(self, ctx):
        """Clear all slash commands from the configured guild."""
        if not ctx.author.guild_permissions.manage_guild:
            await ctx.send("❌ You don't have the required permissions to use this command.")
            return

        try:
            self.bot.tree.clear_commands(guild=discord.Object(id=self.bot.GUILD_ID))
            await self.bot.tree.sync(guild=discord.Object(id=self.bot.GUILD_ID))
            await ctx.send("🔄 All slash commands have been cleared from the server.")
        except Exception as e:
            await ctx.send(f"❌ Failed to clear slash commands: {e}")

    @app_commands.command(name='kick', description='Kick a player.')
    @app_commands.describe(
        member='The member to kick',
        reason='Reason for kicking'
    )
    @app_commands.checks.has_permissions(kick_members=True)
    async def kick(self, interaction: discord.Interaction, member: discord.Member, reason: str):
        """Kick a specified member from the server."""
        try:
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
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
            log_channel = self.bot.get_channel(self.bot.LOG_CHANNEL_ID)
            if log_channel:
                await log_channel.send(embed=embed)
            await interaction.response.send_message(embed=embed, ephemeral=True)
        except Exception as e:
            traceback.print_exc()
            await interaction.response.send_message("❌ An error occurred while kicking the user.", ephemeral=True)

    @app_commands.command(name='ban', description='Ban a player.')
    @app_commands.describe(
        member='The member to ban',
        reason='Reason for banning'
    )
    @app_commands.checks.has_permissions(ban_members=True)
    async def ban(self, interaction: discord.Interaction, member: discord.Member, reason: str):
        """Ban a specified member from the server."""
        try:
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
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
            log_channel = self.bot.get_channel(self.bot.LOG_CHANNEL_ID)
            if log_channel:
                await log_channel.send(embed=embed)
            await interaction.response.send_message(embed=embed, ephemeral=True)
        except Exception as e:
            traceback.print_exc()
            await interaction.response.send_message("❌ An error occurred while banning the user.", ephemeral=True)

    @app_commands.command(name='mute', description='Mute a player.')
    @app_commands.describe(
        member='The member to mute',
        reason='Reason for muting',
        duration='Duration of the mute'
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
    @app_commands.checks.has_permissions(moderate_members=True)
    async def mute(self, interaction: discord.Interaction, member: discord.Member, reason: str, duration: app_commands.Choice[str]):
        """Mute a specified member for a given duration."""
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
            try:
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
                embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
                log_channel = self.bot.get_channel(self.bot.LOG_CHANNEL_ID)
                if log_channel:
                    await log_channel.send(embed=embed)
                await interaction.response.send_message(embed=embed, ephemeral=True)
            except Exception as e:
                traceback.print_exc()
                await interaction.response.send_message("❌ An error occurred while muting the user.", ephemeral=True)
        else:
            await interaction.response.send_message("❌ Invalid mute duration.", ephemeral=True)

    @sync_commands.error
    async def sync_commands_error(self, ctx, error):
        if isinstance(error, commands.MissingRole):
            await ctx.send("❌ You don't have the required role to use this command.")
        else:
            await ctx.send("❌ An error occurred while synchronizing commands.")

    @kick.error
    async def kick_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.errors.MissingPermissions):
            await interaction.response.send_message("❌ You don't have permission to kick members.", ephemeral=True)
        else:
            await interaction.response.send_message("❌ An error occurred while kicking the user.", ephemeral=True)

    @ban.error
    async def ban_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.errors.MissingPermissions):
            await interaction.response.send_message("❌ You don't have permission to ban members.", ephemeral=True)
        else:
            await interaction.response.send_message("❌ An error occurred while banning the user.", ephemeral=True)

    @mute.error
    async def mute_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.errors.MissingPermissions):
            await interaction.response.send_message("❌ You don't have permission to mute members.", ephemeral=True)
        else:
            await interaction.response.send_message("❌ An error occurred while muting the user.", ephemeral=True)


async def setup(bot):
    await bot.add_cog(Moderation(bot))