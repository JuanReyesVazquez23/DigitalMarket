using DigitalGaming.Application.DTOs;
using DigitalGaming.Core.Interfaces;
using DigitalGaming.Core.Models;

namespace DigitalGaming.Application.Services;

/// <summary>
/// Implements checkout: validates stock, snapshots prices and discounts inventory.
/// </summary>
/// <remarks>Layer: Application. Shipping zones mirror ts/services/shipping.ts.</remarks>
/// <param name="orders">The order repository.</param>
/// <param name="products">The product repository.</param>
public sealed class OrderService(IOrderRepository orders, IProductRepository products) : IOrderService
{
    private readonly IOrderRepository _orders = orders ?? throw new ArgumentNullException(nameof(orders));
    private readonly IProductRepository _products = products ?? throw new ArgumentNullException(nameof(products));

    private const int FreeShippingOver = 20000;

    /// <inheritdoc/>
    public async Task<Order> CheckoutAsync(Guid userId, string username, IReadOnlyList<CheckoutItemDto> items, string? zoneId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(items);
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("Usuario inválido.", nameof(userId));
        }

        if (items.Count == 0)
        {
            throw new ArgumentException("El carrito está vacío.", nameof(items));
        }

        var lines = new List<OrderItem>();
        // Why se agrupa por producto: dos líneas del mismo producto no deben
        // validar stock cada una por separado (vendía de más).
        var grouped = items
            .GroupBy(i => i.ProductId)
            .Select(g => (ProductId: g.Key, Quantity: g.Sum(i => i.Quantity)))
            .ToList();
        foreach (var (productId, quantity) in grouped)
        {
            if (quantity < 1 || quantity > 99)
            {
                throw new ArgumentException($"Cantidad inválida para un producto.", nameof(items));
            }

            var product = await _products.GetByIdAsync(productId, cancellationToken).ConfigureAwait(false);
            if (product is null)
            {
                throw new InvalidOperationException("Un producto del carrito ya no existe.");
            }

            if (product.Stock < quantity)
            {
                throw new InvalidOperationException($"Sin stock suficiente de \"{product.Name}\" (quedan {product.Stock}).");
            }

            lines.Add(new OrderItem(product.Id, product.Name, product.Price, quantity));
        }

        var subtotal = lines.Sum(l => l.UnitPrice * l.Quantity);
        var zone = NormalizeZone(zoneId);
        var shipping = subtotal >= FreeShippingOver ? 0 : ZoneCost(zone);
        var order = new Order(Guid.NewGuid(), userId, username, lines, subtotal + shipping, DateTime.UtcNow, zone, shipping);
        await _orders.AddAsync(order, cancellationToken).ConfigureAwait(false);

        // Why después de crear el pedido: si falla el descuento, el pedido ya quedó registrado para conciliar.
        foreach (var line in lines)
        {
            var product = await _products.GetByIdAsync(line.ProductId, cancellationToken).ConfigureAwait(false);
            if (product is not null)
            {
                await _products.UpdateAsync(product with { Stock = product.Stock - line.Quantity }, cancellationToken).ConfigureAwait(false);
            }
        }

        return order;
    }

    /// <inheritdoc/>
    public Task<IReadOnlyList<Order>> GetAllAsync(CancellationToken cancellationToken = default)
        => _orders.GetAllAsync(cancellationToken);

    /// <inheritdoc/>
    public Task<IReadOnlyList<Order>> GetMineAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("Usuario inválido.", nameof(userId));
        }

        return _orders.GetByUserAsync(userId, cancellationToken);
    }

    private static string NormalizeZone(string? zoneId) => zoneId?.Trim().ToLowerInvariant() switch
    {
        "interior" => "interior",
        "pickup" => "pickup",
        _ => "santo-domingo",
    };

    private static decimal ZoneCost(string zone) => zone switch
    {
        "interior" => 450,
        "pickup" => 0,
        _ => 250,
    };
}
