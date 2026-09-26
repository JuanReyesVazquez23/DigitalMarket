using DigitalGaming.Core.Interfaces;
using DigitalGaming.Core.Models;
using DigitalGaming.Infrastructure.Persistence;
using DigitalGaming.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace DigitalGaming.Infrastructure.Repositories;

/// <summary>
/// Provides a Postgres implementation of <see cref="IOrderRepository"/> via EF Core.
/// </summary>
/// <remarks>Layer: Infrastructure.</remarks>
/// <param name="db">The database context.</param>
public sealed class EfOrderRepository(AppDbContext db) : IOrderRepository
{
    private readonly AppDbContext _db = db ?? throw new ArgumentNullException(nameof(db));

    /// <inheritdoc/>
    public async Task<Order> AddAsync(Order order, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(order);
        _db.Orders.Add(OrderEntity.FromDomain(order));
        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return order;
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<Order>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var items = await _db.Orders.AsNoTracking()
            .Include(o => o.Items)
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return items.Select(o => o.ToDomain()).ToList();
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<Order>> GetByUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var items = await _db.Orders.AsNoTracking()
            .Include(o => o.Items)
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return items.Select(o => o.ToDomain()).ToList();
    }
}
