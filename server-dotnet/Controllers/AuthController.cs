using System.Security.Claims;
using DigitalGaming.Application.DTOs;
using DigitalGaming.Core.Interfaces;
using DigitalGaming.Infrastructure.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace DigitalGaming.Api.Controllers;

/// <summary>
/// Exposes registration, login, refresh and logout (username + password, JWT + rotation).
/// </summary>
/// <remarks>Rate limited per IP against brute force (policy "auth").</remarks>
[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public sealed class AuthController(IAuthService auth) : ControllerBase
{
    private readonly IAuthService _auth = auth ?? throw new ArgumentNullException(nameof(auth));

    /// <summary>
    /// Registers a user with username and password.
    /// </summary>
    /// <param name="dto">The registration payload.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The session with JWT.</returns>
    [HttpPost("register")]
    [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AuthResponseDto>> Register([FromBody] RegisterDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var session = await _auth.RegisterAsync(dto, ct).ConfigureAwait(false);
            return CreatedAtAction(nameof(Me), null, session);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Validates username and password, returning a JWT session.
    /// </summary>
    /// <param name="dto">The login payload.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The session with JWT.</returns>
    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponseDto>> Login([FromBody] LoginDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var session = await _auth.LoginAsync(dto, ct).ConfigureAwait(true);
        return session is null ? Unauthorized(new { message = "Nombre o contraseña incorrectos." }) : Ok(session);
    }

    /// <summary>
    /// Gets the current JWT identity (requires login).
    /// </summary>
    /// <returns>The username and role from the token.</returns>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<object> Me()
    {
        var username = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("unique_name");
        var role = User.FindFirstValue(ClaimTypes.Role);
        return Ok(new { username, role });
    }

    /// <summary>
    /// Tells whether the logged-in user is the configured admin.
    /// </summary>
    /// <param name="options">The admin settings.</param>
    /// <returns>Whether the current user may enter admin mode.</returns>
    [HttpGet("admin-status")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<object> AdminStatus([FromServices] IOptions<AdminOptions> options)
    {
        var username = User.FindFirstValue(ClaimTypes.Name);
        var configured = options?.Value?.Username;
        var isAdmin = !string.IsNullOrWhiteSpace(username)
            && !string.IsNullOrWhiteSpace(configured)
            && string.Equals(username.Trim(), configured.Trim(), StringComparison.OrdinalIgnoreCase);
        return Ok(new { username, isAdmin });
    }

    /// <summary>
    /// Rotates a refresh token, issuing a new session.
    /// </summary>
    /// <param name="dto">The rotation payload.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The new session.</returns>
    [HttpPost("refresh")]
    [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<AuthResponseDto>> Refresh([FromBody] RefreshDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var session = await _auth.RefreshAsync(dto.RefreshToken, ct).ConfigureAwait(false);
        return session is null ? Unauthorized(new { message = "Sesión inválida o vencida. Entra de nuevo." }) : Ok(session);
    }

    /// <summary>
    /// Logs out: revokes one refresh token, or all user sessions.
    /// </summary>
    /// <param name="dto">The logout payload.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>No content.</returns>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Logout([FromBody] LogoutDto? dto, CancellationToken ct)
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(raw, out var userId))
        {
            return Unauthorized();
        }

        await _auth.LogoutAsync(userId, dto?.RefreshToken, ct).ConfigureAwait(false);
        return NoContent();
    }
}
