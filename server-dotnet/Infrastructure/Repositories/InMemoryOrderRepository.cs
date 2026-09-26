using System.Collections.Concurrent;
using DigitalGaming.Core.Interfaces;
using DigitalGaming.Core.Models;

namespace DigitalGaming.Infrastructure.Repositories;

/// <summary>
/// Provides an in-memory implementation of <see cref="IOrderRepository"/> for the MVP.
/// </summary>
/// <remarks>Layer: Infrastructure.</remarks>
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly ConcurrentDictionary<Guid, Order> _store = new();

    /// <inheritdoc/>
    public Task<Order> AddAsync(Order order, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(order);
        cancellationToken.ThrowIfCancellationRequested();
        _store[order.Id] = order;
        return Task.FromResult(order);
    }

    /// <inheritdoc/>
    public Task<IReadOnlyList<Order>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IReadOnlyList<Order> result = _store.Values
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToList();
        return Task.FromResult(result);
    }

    /// <inheritdoc/>
    public Task<IReadOnlyList<Order>> GetByUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IReadOnlyList<Order> result = _store.Values
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToList();
        return Task.FromResult(result);
    }
}
