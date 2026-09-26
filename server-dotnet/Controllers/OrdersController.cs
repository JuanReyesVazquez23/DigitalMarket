using System.Security.Claims;
using DigitalGaming.Application.DTOs;
using DigitalGaming.Core.Interfaces;
using DigitalGaming.Core.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DigitalGaming.Api.Controllers;

/// <summary>
/// Exposes checkout and order history. Buying requires login (JWT).
/// </summary>
[Authorize]
[ApiController]
[Route("api/[controller]")]
public sealed class OrdersController(IOrderService orders) : ControllerBase
{
    private readonly IOrderService _orders = orders ?? throw new ArgumentNullException(nameof(orders));

    /// <summary>
    /// Buys the cart items, validating stock and discounting inventory.
    /// </summary>
    /// <param name="dto">The cart payload.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The created order.</returns>
    [HttpPost]
    [ProducesResponseType(typeof(Order), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<Order>> Checkout([FromBody] CheckoutDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var userId = CurrentUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var username = User.FindFirstValue(ClaimTypes.Name) ?? "cliente";
        try
        {
            var order = await _orders.CheckoutAsync(userId.Value, username, dto.Items, dto.ZoneId, ct).ConfigureAwait(false);
            return CreatedAtAction(nameof(Mine), null, order);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Gets every order with buyer info (admin only).
    /// </summary>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>All orders, newest first.</returns>
    [HttpGet]
    [Authorize(Roles = "admin")]
    [ProducesResponseType(typeof(IReadOnlyList<Order>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<IReadOnlyList<Order>>> GetAll(CancellationToken ct)
    {
        return Ok(await _orders.GetAllAsync(ct).ConfigureAwait(false));
    }

    /// <summary>
    /// Gets the order history of the logged-in user.
    /// </summary>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The user orders.</returns>
    [HttpGet("mine")]
    [ProducesResponseType(typeof(IReadOnlyList<Order>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IReadOnlyList<Order>>> Mine(CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(await _orders.GetMineAsync(userId.Value, ct).ConfigureAwait(false));
    }

    private Guid? CurrentUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }
}
