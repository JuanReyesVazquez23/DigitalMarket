namespace DigitalGaming.Infrastructure.Security;

/// <summary>
/// Gets the strongly-typed admin settings bound from configuration.
/// </summary>
/// <remarks>
/// Layer: Infrastructure. The only admin is the username in <c>Admin:Username</c>
/// (env var <c>Admin__Username</c>). Defaults to "admin" for local dev.
/// </remarks>
public sealed class AdminOptions
{
    /// <summary>
    /// Gets or sets the login name allowed into admin mode and admin APIs.
    /// </summary>
    public string Username { get; set; } = "admin";
}
