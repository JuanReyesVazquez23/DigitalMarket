using DigitalGaming.Core.Models;

namespace DigitalGaming.Core.Interfaces;

/// <summary>
/// Defines async data access operations for <see cref="Order"/> entities.
/// </summary>
/// <remarks>Layer: Core (Repository Pattern abstraction).</remarks>
public interface IOrderRepository
{
    /// <summary>
    /// Adds an order asynchronously.
    /// </summary>
    /// <param name="order">The order to add.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The added order.</returns>
    Task<Order> AddAsync(Order order, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets every order asynchronously (admin).
    /// </summary>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>All orders, newest first.</returns>
    Task<IReadOnlyList<Order>> GetAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets the orders of a user asynchronously.
    /// </summary>
    /// <param name="userId">The buying user identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The user orders, newest first.</returns>
    Task<IReadOnlyList<Order>> GetByUserAsync(Guid userId, CancellationToken cancellationToken = default);
}
