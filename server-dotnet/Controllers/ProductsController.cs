using DigitalGaming.Application.DTOs;
using DigitalGaming.Core.Interfaces;
using DigitalGaming.Core.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DigitalGaming.Api.Controllers;

/// <summary>
/// Exposes the store catalog as a REST API for the HTML/TS frontend.
/// </summary>
/// <remarks>Reading is public; creating, editing and deleting require login (JWT).</remarks>
[ApiController]
[Route("api/[controller]")]
public sealed class ProductsController(IProductService service) : ControllerBase
{
    private readonly IProductService _service = service ?? throw new ArgumentNullException(nameof(service));

    /// <summary>
    /// Gets one catalog window by displacement (offset/limit), CDN-cacheable.
    /// </summary>
    /// <param name="limit">The window size.</param>
    /// <param name="offset">The displacement from the start.</param>
    /// <param name="category">The category name filter.</param>
    /// <param name="q">The text search.</param>
    /// <param name="includeHidden">Whether to include hidden products.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The requested window.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<Product>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<Product>>> GetPaged(
        [FromQuery] int limit = 12,
        [FromQuery] int offset = 0,
        [FromQuery] string? category = null,
        [FromQuery] string? q = null,
        [FromQuery] bool includeHidden = false,
        CancellationToken ct = default)
    {
        // Why caché CDN: el catálogo es público e igual para todos; cada URL
        // (con su querystring) se cachea 60s con revalidación de fondo.
        Response.Headers.CacheControl = "public, s-maxage=60, stale-while-revalidate=300";
        var page = await _service.GetPagedAsync(limit, offset, category, q, includeHidden, ct).ConfigureAwait(false);
        return Ok(page);
    }

    /// <summary>
    /// Gets the full product catalog (admin/lists).
    /// </summary>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The list of products.</returns>
    [HttpGet("all")]
    [ProducesResponseType(typeof(IReadOnlyList<Product>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<Product>>> GetAll(CancellationToken ct)
    {
        var items = await _service.GetCatalogAsync(ct).ConfigureAwait(false);
        return Ok(items);
    }

    /// <summary>
    /// Creates a product from the admin panel.
    /// </summary>
    /// <param name="dto">The creation payload.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The created product.</returns>
    [HttpPost]
    [Authorize(Policy = "AdminUser")]
    [ProducesResponseType(typeof(Product), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<Product>> Create([FromBody] CreateProductDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var created = await _service.CreateAsync(dto, ct).ConfigureAwait(false);
        return CreatedAtAction(nameof(GetAll), new { id = created.Id }, created);
    }

    /// <summary>
    /// Deletes a product by identifier.
    /// </summary>
    /// <param name="id">The product identifier.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>No content if deleted; otherwise, not found.</returns>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminUser")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var removed = await _service.RemoveAsync(id, ct).ConfigureAwait(false);
        return removed ? NoContent() : NotFound();
    }

    /// <summary>
    /// Updates a product from the admin panel.
    /// </summary>
    /// <param name="id">The product identifier.</param>
    /// <param name="dto">The updated values.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The updated product; otherwise, not found or bad request.</returns>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminUser")]
    [ProducesResponseType(typeof(Product), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Product>> Update(Guid id, [FromBody] UpdateProductDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _service.UpdateAsync(id, dto, ct).ConfigureAwait(false);
        return updated is null ? NotFound() : Ok(updated);
    }
}

