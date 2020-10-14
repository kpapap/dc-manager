import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CubeBuilderService } from 'app/admin/pages/cube-builder.service';
import { Store, select } from '@ngrx/store';
import { AdminState, DefinitionCube, MetadataCube } from 'app/admin/admin.state';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { showLoading, closeLoading } from 'app/app.action';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-cube-preview',
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.scss']
})
export class CreateCubePreviewComponent implements OnInit {

  public formCreate: FormGroup
  public gridCompleted: boolean
  public regionCompleted: boolean
  public definitionCompleted: boolean
  public definition: DefinitionCube
  public metadata: MetadataCube
  public grid: string
  public tiles: string[]
  public urlSTAC: string
  public collection: string
  public satellite: string
  public rangeDates: string[]
  public cost = {}

  public environmentVersion = window['__env'].environmentVersion

  constructor(
    private store: Store<AdminState>,
    private cbs: CubeBuilderService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private router: Router) {
    this.formCreate = this.fb.group({
      agree: [false, Validators.requiredTrue]
    });

    this.store.pipe(select('admin' as any)).subscribe(res => {
      if (res.grid && res.grid !== '') {
        this.grid = res.grid
        this.gridCompleted = true
      }
      if (res.tiles && res.tiles.length > 0) {
        this.tiles = res.tiles
        this.regionCompleted = true
      }
      if (res.definitionInfos && res.definitionInfos.resolution) {
        this.definition = res.definitionInfos
        this.definitionCompleted = true
      }
      if (res.metadata) {
        this.metadata = res.metadata
      }
      if (res.urlSTAC) {
        this.urlSTAC = res.urlSTAC
      }
      if (res.collection) {
        this.collection = res.collection
      }
      if (res.satellite) {
        this.satellite = res.satellite
      }
      if (res.startDate && res.lastDate) {
        this.rangeDates = [res.startDate, res.lastDate]
      }

      if (this.environmentVersion === 'cloud' &&
          this.gridCompleted && this.regionCompleted && this.definitionCompleted) {
        this.getCost()
      }
    })
  }

  ngOnInit() {
    this.gridCompleted = false
    this.regionCompleted = false
    this.definitionCompleted = false
  }

  async getCost() {
    try {
      this.store.dispatch(showLoading())
      const temporalCompositions = await this.cbs.getTemporalCompositions()
      const temporalSchema = temporalCompositions.filter(t => t.id === this.definition.temporal)
      const data = {
        start_date: this.rangeDates[0],
        last_date: this.rangeDates[1],
        satellite: this.satellite,
        resolution: this.definition.resolution,
        grid: this.grid,
        quantity_bands: this.definition.bands.length,
        quantity_tiles: this.tiles.length,
        quantity_indexes: this.definition.indexes.length,
        t_schema: temporalSchema[0].temporal_schema,
        t_step: parseInt(temporalSchema[0].temporal_composite_t)
      }

      const response = await this.cbs.estimateCost(data)
      const funcs = ['', 'STK', 'MED']
      funcs.forEach(func => {
        if (!func || func === '') {
          this.cost['IDENTITY'] = {
            tasks: response['build']['quantity_merges'] + response['build']['quantity_merges'],
            items: response['build']['collection_items_irregular'],
            assets: response['build']['quantity_merges'],
            price: response['build']['price_merges'] + response['build']['price_publish'],
            priceStorage: response['storage']['price_irregular_cube'],
            size: response['storage']['size_irregular_cube']
          }
        } else {
          this.cost[func] = {
            tasks: response['build']['quantity_blends'] + response['build']['quantity_publish'],
            items: response['build']['collection_items'] / 2,
            assets: response['build']['quantity_blends'] / 2,
            price: (response['build']['price_blends'] + response['build']['price_publish']) / 2,
            priceStorage: response['storage']['price_cubes'] / 2,
            size: response['storage']['size_cubes'] / 2
          }
        }
      })

    } catch(err) {
    } finally {
      this.store.dispatch(closeLoading())
    }
  }

  getCubeName(func) {
    const parts = this.definition.name.split('_')
    return func ? `${this.definition.name}_${func}` : `${parts[0]}_${parts[1]}`
  }

  getCubeTypeDescription(func) {
    switch (func) {
      case 'STK': return 'Data cube using the STACK composition function'
      case 'MED': return 'Data cube using the MED composition function'
      default: return 'Irregular Data cube'
    }
  }

  async create() {
    if (this.formCreate.status !== 'VALID') {
      this.snackBar.open('Accept the terms of use', '', {
        duration: 4000,
        verticalPosition: 'top',
        panelClass: 'app_snack-bar-error'
      });
    } else {
      try {
        this.store.dispatch(showLoading());

        // CREATE RASTER SIZE SCHEMA
        const rasterSchema = {
          grs_schema: this.grid,
          resolution: this.definition.resolution,
          chunk_size_x: 256,
          chunk_size_y: 256
        }
        const respRaster = await this.cbs.createRasterSchema(rasterSchema)

        const cubeId = this.environmentVersion === 'local' ? this.definition.name.split('_')[0] : this.definition.name;

        // CREATE CUBES METADATA
        const cube = {
          datacube: cubeId,
          grs: this.grid,
          resolution: this.definition.resolution,
          temporal_schema: this.definition.temporal,
          composite_function: this.definition.functions,
          bands: this.definition.bands.map(b => {
            return {'name': b, 'common_name': b, 'data_type': b !== this.definition.qualityBand ? 'int16' : 'uint8'}
          }),
          bands_quicklook: this.definition.bandsQuicklook,
          indexes: this.definition.indexes.map(i => {
            return {'name': i, 'common_name': i, 'data_type': 'int16'}
          }),
          license: this.metadata.license,
          description: this.metadata.description,
          quality_band: this.definition.qualityBand
        }
        const respCube = await this.cbs.create(cube)

        // START CUBE CREATION
        const process = {
          process_id: respCube['cubes']['process_id'],
          url_stac: this.urlSTAC,
          bucket: this.definition.bucket,
          tiles: this.tiles,
          collections: this.collection,
          satellite: this.satellite,
          start_date: this.rangeDates[0],
          end_date: this.rangeDates[1],
          force: false
        }
        if (this.environmentVersion === 'local') {
          delete process['bucket']
          delete process['process_id']
          delete process['satellite']

          const compositeFunctions = this.definition.functions.filter(fn => fn !== 'IDENTITY');

          if (compositeFunctions.length !== 0) {
            process['composite_functions'] = compositeFunctions;
            process['datacube'] = `${this.definition.name}_${compositeFunctions[0]}`;
          } else {
            // Only IDENTITY selected
            process['datacube'] = this.definition.name.split('_').slice(0, 2).join('_')
          }

        }
        const respStart = await this.cbs.start(process)

        this.snackBar.open('Cubes started with successfully', '', {
          duration: 4000,
          verticalPosition: 'top',
          panelClass: 'app_snack-bar-success'
        });
        this.router.navigate(['/list-cubes']);

      } catch (error) {
        const err = error && error.response ? error.response : 'Error creating cube'
        this.snackBar.open(err, '', {
          duration: 4000,
          verticalPosition: 'top',
          panelClass: 'app_snack-bar-error'
        });

      } finally {
        this.store.dispatch(closeLoading());
      }
    }
  }
}
