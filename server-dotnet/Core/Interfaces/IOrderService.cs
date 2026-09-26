using DigitalGaming.Application.DTOs;
using DigitalGaming.Core.Models;

namespace DigitalGaming.Core.Interfaces;

/// <summary>
/// Defines checkout operations (cart purchase, login required).
/// </summary>
/// <remarks>Layer: Core (Service contract, implemented in Application).</remarks>
public interface IOrderService
{
    /// <summary>
    /// Creates an order from cart items, validating stock asynchronously.
    /// </summary>
    /// <param name="userId">The buying user identifier.</param>
    /// <param name="username">The buying username.</param>
    /// <param name="items">The cart items.</param>
    /// <param name="zoneId">The shipping zone identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The created order.</returns>
    Task<Order> CheckoutAsync(Guid userId, string username, IReadOnlyList<CheckoutItemDto> items, string? zoneId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets every order asynchronously (admin).
    /// </summary>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>All orders, newest first.</returns>
    Task<IReadOnlyList<Order>> GetAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets the order history of a user asynchronously.
    /// </summary>
    /// <param name="userId">The buying user identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The user orders, newest first.</returns>
    Task<IReadOnlyList<Order>> GetMineAsync(Guid userId, CancellationToken cancellationToken = default);
}
