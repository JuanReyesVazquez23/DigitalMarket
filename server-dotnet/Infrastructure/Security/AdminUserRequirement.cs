using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace DigitalGaming.Infrastructure.Security;

/// <summary>
/// Requires the logged-in username to equal the configured admin username.
/// </summary>
public sealed class AdminUserRequirement : IAuthorizationRequirement
{
}

/// <summary>
/// Evaluates <see cref="AdminUserRequirement"/> against <see cref="AdminOptions"/>.
/// </summary>
/// <param name="options">The admin settings.</param>
public sealed class AdminUserHandler(IOptions<AdminOptions> options) : AuthorizationHandler<AdminUserRequirement>
{
    private readonly AdminOptions _options = options?.Value ?? throw new ArgumentNullException(nameof(options));

    /// <inheritdoc/>
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, AdminUserRequirement requirement)
    {
        var username = context.User.FindFirstValue(ClaimTypes.Name);
        if (!string.IsNullOrWhiteSpace(username)
            && !string.IsNullOrWhiteSpace(_options.Username)
            && string.Equals(username.Trim(), _options.Username.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
